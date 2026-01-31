package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"github.com/google/generative-ai-go/genai"
	"github.com/joho/godotenv"
	"github.com/supabase-community/supabase-go"
	"google.golang.org/api/iterator"
	"google.golang.org/api/option"
)

func main() {
	// Load .env.local
	_ = godotenv.Load("../.env.local")
	apiKey := os.Getenv("GEMINI_API_KEY")
	apiUrl := os.Getenv("NEXT_PUBLIC_SUPABASE_URL")
	serviceKey := os.Getenv("SUPABASE_SERVICE_ROLE_KEY")

	if apiKey == "" {
		log.Fatal("GEMINI_API_KEY is missing")
	}

	ctx := context.Background()
	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		log.Fatal(err)
	}
	defer client.Close()

	fmt.Println("--- Available Gemini Models ---")
	iter := client.ListModels(ctx)
	for {
		m, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			log.Fatal(err)
		}
		fmt.Printf("MODEL: %s\n", m.Name)
	}

	fmt.Println("--- Database Status ---")
	supaClient, err := supabase.NewClient(apiUrl, serviceKey, nil)
	if err != nil {
		log.Fatal("Supabase init failed:", err)
	}
	
	// Check document_chunks count (approximate via select id)
	var chunks []struct {
		ID string `json:"id"`
	}
	_, err = supaClient.From("document_chunks").Select("id", "exact", false).Limit(10, "").ExecuteTo(&chunks)
	if err != nil {
		fmt.Println("Error checking chunks:", err)
	} else {
		fmt.Printf("Found %d sample chunks (if 0, table is likely empty).\n", len(chunks))
	}
}
