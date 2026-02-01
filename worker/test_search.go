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

type SearchResult struct {
	ID         string  `json:"id"`
	DocumentID string  `json:"document_id"`
	PageNumber int     `json:"page_number"`
	Content    string  `json:"content"`
	Similarity float64 `json:"similarity"`
}

func main() {
	_ = godotenv.Load("../.env.local")
	apiUrl := os.Getenv("NEXT_PUBLIC_SUPABASE_URL")
	serviceKey := os.Getenv("SUPABASE_SERVICE_ROLE_KEY")
	geminiKey := os.Getenv("GEMINI_API_KEY")

	if apiUrl == "" || serviceKey == "" || geminiKey == "" {
		log.Fatal("Missing credentials")
	}

	// Handle comma-separated API keys
	apiKeys := strings.Split(geminiKey, ",")
	if len(apiKeys) > 0 {
		geminiKey = strings.TrimSpace(apiKeys[0])
	}

	// Initialize Gemini
	ctx := context.Background()
	genClient, err := genai.NewClient(ctx, option.WithAPIKey(geminiKey))
	if err != nil {
		log.Fatal("Gemini init failed:", err)
	}
	defer genClient.Close()

	fmt.Println("=== Testing Vector Search ===\n")

	// Test query
	query := "krl adalah?"
	fmt.Printf("Query: %s\n\n", query)

	// Generate embedding
	embeddingModel := genClient.EmbeddingModel("text-embedding-004")
	embeddingResult, err := embeddingModel.EmbedContent(ctx, genai.Text(query))
	if err != nil {
		log.Fatal("Embedding generation failed:", err)
	}

	embedding := embeddingResult.Embedding.Values
	fmt.Printf("Generated embedding with %d dimensions\n\n", len(embedding))

	// Call vector search using direct HTTP
	requestBody := map[string]interface{}{
		"query_embedding": embedding,
		"match_count":     5,
		"filter_user_id":  nil,
	}

	bodyBytes, _ := json.Marshal(requestBody)
	
	url := fmt.Sprintf("%s/rest/v1/rpc/search_documents_vector", apiUrl)
	req, _ := http.NewRequest("POST", url, bytes.NewBuffer(bodyBytes))
	req.Header.Set("Authorization", "Bearer "+serviceKey)
	req.Header.Set("apikey", serviceKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Fatal("HTTP request failed:", err)
	}
	defer resp.Body.Close()

	responseBody, _ := io.ReadAll(resp.Body)
	
	if resp.StatusCode != 200 {
		log.Fatalf("Vector search failed with status %d: %s", resp.StatusCode, string(responseBody))
	}

	var results []SearchResult
	err = json.Unmarshal(responseBody, &results)
	if err != nil {
		log.Fatal("JSON unmarshal failed:", err)
	}

	fmt.Printf("Found %d results:\n\n", len(results))

	if len(results) == 0 {
		fmt.Println("❌ NO RESULTS FOUND!")
		fmt.Println("This is why the chat returns 'TIDAK DITEMUKAN DI DOKUMEN YANG DIUPLOAD.'")
	} else {
		for i, r := range results {
			preview := r.Content
			if len(preview) > 100 {
				preview = preview[:100] + "..."
			}
			fmt.Printf("[%d] Page %d (Similarity: %.3f)\n", i+1, r.PageNumber, r.Similarity)
			fmt.Printf("    %s\n\n", preview)
		}
	}
}
