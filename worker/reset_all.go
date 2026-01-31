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

	fmt.Println("☢️ NUCLEAR RESET INITIATED...")

	// 1. Reset ALL jobs to queued
    fmt.Println("Resetting ALL jobs to queued...")
	_, _, err = supaClient.From("jobs").Update(map[string]interface{}{"status": "queued", "attempts": 0}, "", "").Gt("created_at", "2000-01-01").Execute()
	if err != nil {
		fmt.Println("❌ Failed to reset jobs:", err)
	} else {
        fmt.Println("✅ Jobs reset.")
    }

	// 2. Reset ALL documents to uploaded
    fmt.Println("Resetting all documents to uploaded...")
	_, _, err = supaClient.From("documents").Update(map[string]interface{}{"status": "uploaded"}, "", "").Gt("created_at", "2000-01-01").Execute()
    if err != nil {
        fmt.Println("❌ Failed to reset documents:", err)
    } else {
        fmt.Println("✅ Documents reset.")
    }
}
