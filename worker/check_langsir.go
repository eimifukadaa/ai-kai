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

	client, err := supabase.NewClient(apiUrl, serviceKey, nil)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println("=== Searching for 'Langsir' in Database ===")

	var chunks []struct {
		Content    string `json:"content"`
		PageNumber int    `json:"page_number"`
		DocID      string `json:"document_id"`
	}

	// Search for the word "Langsir" (case insensitive)
	_, err = client.From("document_chunks").
		Select("content, page_number, document_id", "exact", false).
		Ilike("content", "%Langsir%").
		Limit(10, "").
		ExecuteTo(&chunks)

	if err != nil {
		log.Fatal(err)
	}

	if len(chunks) == 0 {
		fmt.Println("❌ 'Langsir' NOT FOUND in document_chunks!")
	} else {
		fmt.Printf("✅ Found %d chunks containing 'Langsir'.\n", len(chunks))
		for i, c := range chunks {
			fmt.Printf("\n[%d] Doc: %s, Page: %d\n", i+1, c.DocID, c.PageNumber)
			preview := c.Content
			if len(preview) > 200 {
				preview = preview[:200] + "..."
			}
			fmt.Println(preview)
		}
	}
}
