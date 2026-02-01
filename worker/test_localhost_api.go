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

	if geminiKey == "" {
		log.Fatal("Missing GEMINI_API_KEY")
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

	fmt.Println("=== Testing Localhost Chat API ===\n")

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

	// Call the actual chat API endpoint
	requestBody := map[string]interface{}{
		"messages": []map[string]string{
			{"role": "user", "content": query},
		},
	}

	bodyBytes, _ := json.Marshal(requestBody)
	
	url := "http://localhost:3000/api/chat/send"
	req, _ := http.NewRequest("POST", url, bytes.NewBuffer(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	// Add a fake session cookie or auth header if needed
	// For now, let's see if it works without auth

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Fatal("HTTP request failed:", err)
	}
	defer resp.Body.Close()

	responseBody, _ := io.ReadAll(resp.Body)
	
	fmt.Printf("Status Code: %d\n", resp.StatusCode)
	fmt.Printf("Response:\n%s\n", string(responseBody))

	if strings.Contains(string(responseBody), "TIDAK DITEMUKAN") {
		fmt.Println("\n❌ BUG STILL PRESENT!")
	} else if strings.Contains(string(responseBody), "Unauthorized") {
		fmt.Println("\n⚠️  Need authentication to test")
	} else {
		fmt.Println("\n✅ Response looks good!")
	}
}
