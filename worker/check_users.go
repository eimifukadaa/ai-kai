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

	fmt.Println("=== Checking Document Ownership ===\n")

	// Get all documents with their user_ids
	var docs []struct {
		ID     string `json:"id"`
		Name   string `json:"name"`
		UserID string `json:"user_id"`
		Status string `json:"status"`
	}
	_, err = supaClient.From("documents").Select("id,name,user_id,status", "exact", false).Limit(10, "").ExecuteTo(&docs)
	if err != nil {
		log.Fatal("Error checking documents:", err)
	}

	fmt.Printf("Found %d documents:\n\n", len(docs))
	for _, doc := range docs {
		fmt.Printf("- %s\n", doc.Name)
		fmt.Printf("  User ID: %s\n", doc.UserID)
		fmt.Printf("  Status: %s\n\n", doc.Status)
	}

	// Get all users
	var users []struct {
		ID    string `json:"id"`
		Email string `json:"email"`
	}
	_, err = supaClient.From("users").Select("id,email", "exact", false).Limit(10, "").ExecuteTo(&users)
	if err != nil {
		fmt.Println("\n⚠️  Could not fetch users (table may not exist or RLS enabled)")
	} else {
		fmt.Printf("\nFound %d users:\n\n", len(users))
		for _, user := range users {
			fmt.Printf("- Email: %s\n", user.Email)
			fmt.Printf("  ID: %s\n\n", user.ID)
		}
	}
}
