package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/google/generative-ai-go/genai"
	"github.com/joho/godotenv"
	"google.golang.org/api/option"
)

func main() {
	_ = godotenv.Load("../.env.local")
	geminiKey := os.Getenv("GEMINI_API_KEY")
	supaUrl := os.Getenv("NEXT_PUBLIC_SUPABASE_URL")
	supaKey := os.Getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

	// Handle comma-separated Keys
	apiKeys := strings.Split(geminiKey, ",")
	if len(apiKeys) > 0 {
		geminiKey = strings.TrimSpace(apiKeys[0])
	}

	ctx := context.Background()
	client, err := genai.NewClient(ctx, option.WithAPIKey(geminiKey))
	if err != nil {
		log.Fatal(err)
	}
	defer client.Close()

	query := "langsir adalah??"
	fmt.Printf("Query: %s\n", query)

	// 1. Get embedding
	model := client.EmbeddingModel("text-embedding-004")
	res, err := model.EmbedContent(ctx, genai.Text(query))
	if err != nil {
		log.Fatal(err)
	}
	embedding := res.Embedding.Values

	// 2. Call Supabase RPC
	rpcUrl := fmt.Sprintf("%s/rest/v1/rpc/search_documents_vector", supaUrl)
	payload := map[string]interface{}{
		"query_embedding": embedding,
		"match_count":     100, // Matching the MEGA FIX
		"filter_user_id":  nil,
	}
	body, _ := json.Marshal(payload)

	req, _ := http.NewRequest("POST", rpcUrl, bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", supaKey)
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", supaKey))

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Fatal(err)
	}
	defer resp.Body.Close()

	var results []struct {
		PageNumber int     `json:"page_number"`
		Content    string  `json:"content"`
		Similarity float64 `json:"similarity"`
	}
	raw, _ := io.ReadAll(resp.Body)
	json.Unmarshal(raw, &results)

	fmt.Printf("Found %d results\n", len(results))
	
	for i, r := range results {
		if r.PageNumber == 95 {
			fmt.Printf("🎯 FOUND EXPECTED PAGE 95! Rank: %d, Similarity: %.4f\n", i+1, r.Similarity)
            fmt.Println(r.Content)
		}
	}
}
