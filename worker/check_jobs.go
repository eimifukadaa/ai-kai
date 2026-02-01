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

	var jobs []map[string]interface{}
	_, err = client.From("jobs").Select("id, document_id, status, error, attempts", "exact", false).Limit(20, "").ExecuteTo(&jobs)

	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("Found %d jobs\n", len(jobs))
	for _, j := range jobs {
		fmt.Printf("Job %v: %v | Error: %v\n", j["id"], j["status"], j["error"])
	}
}
