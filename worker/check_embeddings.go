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
	serviceKey := os.Getenv("SUPABASE_SERVICE_ROLE_KEY")

	if apiUrl == "" || serviceKey == "" {
		log.Fatal("Missing Supabase credentials")
	}

	supaClient, err := supabase.NewClient(apiUrl, serviceKey, nil)
	if err != nil {
		log.Fatal("Supabase init failed:", err)
	}

	fmt.Println("=== Embedding Status Check ===\n")

	// Count total chunks
	var totalCount int64
	_, totalCount, _ = supaClient.From("document_chunks").Select("id", "exact", true).Execute()
	fmt.Printf("Total chunks: %d\n", totalCount)

	// Count chunks WITH embeddings
	var withEmbeddings int64
	_, withEmbeddings, _ = supaClient.From("document_chunks").Select("id", "exact", true).Not("embedding", "is", "null").Execute()
	fmt.Printf("Chunks WITH embeddings: %d\n", withEmbeddings)

	// Count chunks WITHOUT embeddings
	var withoutEmbeddings int64
	_, withoutEmbeddings, _ = supaClient.From("document_chunks").Select("id", "exact", true).Is("embedding", "null").Execute()
	fmt.Printf("Chunks WITHOUT embeddings: %d\n", withoutEmbeddings)

	if withoutEmbeddings > 0 {
		fmt.Printf("\n❌ PROBLEM FOUND: %d chunks are missing embeddings!\n", withoutEmbeddings)
		fmt.Println("This is why the search returns 'TIDAK DITEMUKAN DI DOKUMEN YANG DIUPLOAD.'")
		fmt.Println("\nThe vector search function requires embeddings to work.")
	} else {
		fmt.Println("\n✅ All chunks have embeddings!")
	}
}
