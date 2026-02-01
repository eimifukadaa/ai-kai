package main

import (
	"fmt"
	"log"
	"os"

	"github.com/joho/godotenv"
	"github.com/supabase-community/supabase-go"
)

func main() {
	_ = godotenv.Load("../.env.local")
	apiUrl := os.Getenv("NEXT_PUBLIC_SUPABASE_URL")
	anonKey := os.Getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

	fmt.Printf("Connecting to: %s\n", apiUrl)

	client, err := supabase.NewClient(apiUrl, anonKey, nil)
	if err != nil {
		log.Fatal(err)
	}

	var results []map[string]interface{}
	_, err = client.From("document_chunks").Select("*", "exact", false).Limit(1, "").ExecuteTo(&results)

	if err != nil {
		fmt.Printf("❌ Query Error: %v\n", err)
	} else {
		fmt.Printf("✅ Query Success! Rows found: %d\n", len(results))
		if len(results) > 0 {
			fmt.Println(results[0])
		}
	}
}
