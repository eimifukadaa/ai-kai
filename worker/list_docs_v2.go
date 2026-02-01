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

	var docs []struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}

	_, err = client.From("documents").Select("id, name", "exact", false).ExecuteTo(&docs)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("Total Documents: %d\n", len(docs))
	for _, d := range docs {
		var chunks []struct{ ID string }
		// Use a better way to count
		client.From("document_chunks").Select("id", "exact", true).Eq("document_id", d.ID).ExecuteTo(&chunks)
		fmt.Printf("ID: %s | Count: %d | Name: %s\n", d.ID, len(chunks), d.Name)
	}
}
