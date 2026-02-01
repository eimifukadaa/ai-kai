package processor

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/google/generative-ai-go/genai"
	"github.com/ledongthuc/pdf"
	"github.com/nguyenthenguyen/docx"
    "github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	"github.com/supabase-community/supabase-go"
	"google.golang.org/api/option"
)

type Job struct {
	ID         string    `json:"id"`
	DocumentID string    `json:"document_id"`
	UserID     string    `json:"user_id"`
	Status     string    `json:"status"`
	Attempts   int       `json:"attempts"`
	CreatedAt  time.Time `json:"created_at"`
}

type Document struct {
	ID          string `json:"id"`
	StoragePath string `json:"storage_path"`
}

type Processor struct {
	client      *supabase.Client
	apiUrl      string
	serviceKey  string
	genAIClient *genai.Client
}

func NewProcessor(client *supabase.Client, apiUrl, serviceKey string) *Processor {
	// Initialize Gemini Client
	apiKey := os.Getenv("GEMINI_API_KEY")
    if strings.Contains(apiKey, ",") {
        apiKey = strings.TrimSpace(strings.Split(apiKey, ",")[0])
    }
    
	ctx := context.Background()
	genClient, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		log.Printf("Warning: Failed to create Gemini client with key %s...: %v", apiKey[:10], err)
	}

	return &Processor{
		client:      client,
		apiUrl:      apiUrl,
		serviceKey:  serviceKey,
		genAIClient: genClient,
	}
}

func (p *Processor) ProcessJob(job Job) error {
	// 1. Get Document Info
	var docs []Document
	_, err := p.client.From("documents").Select("*", "exact", false).Eq("id", job.DocumentID).ExecuteTo(&docs)
	if err != nil || len(docs) == 0 {
		return fmt.Errorf("document not found: %v", err)
	}
	doc := docs[0]

	// 2. Download File
	downloadUrl := fmt.Sprintf("%s/storage/v1/object/kai_docs/%s", p.apiUrl, doc.StoragePath)
	req, _ := http.NewRequest("GET", downloadUrl, nil)
	req.Header.Set("Authorization", "Bearer "+p.serviceKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("download failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("download error %d: %s", resp.StatusCode, string(b))
	}

	// Detect Extension
	ext := strings.ToLower(filepath.Ext(doc.StoragePath))
	if ext == "" {
		ext = ".pdf" // Default
	}

	tempDir := os.TempDir()
	localPath := filepath.Join(tempDir, fmt.Sprintf("%s%s", doc.ID, ext))
	outFile, err := os.Create(localPath)
	if err != nil {
		return err
	}
	_, err = io.Copy(outFile, resp.Body)
	outFile.Close()
	defer os.Remove(localPath)

	if ext == ".docx" {
		return p.processDocx(doc, localPath)
	} else {
		return p.processPdf(doc, localPath)
	}
}

func (p *Processor) processDocx(doc Document, path string) error {
	r, err := docx.ReadDocxFile(path)
	if err != nil {
		return fmt.Errorf("failed to read docx: %v", err)
	}
	docxContent := r.Editable().GetContent()
	
	// Update pages_total to 1 (DOCX is treated as 1 unit for now, or we can try to split?)
	// Splitting DOCX by page is hard. We'll treat it as 1 page.
	p.client.From("documents").Update(map[string]interface{}{"pages_total": 1}, "", "").Eq("id", doc.ID).Execute()

	// Save Page 1
	p.client.From("document_chunks").Delete("", "").Eq("document_id", doc.ID).Execute()
	p.client.From("document_pages").Delete("", "").Eq("document_id", doc.ID).Execute()

	_, _, err = p.client.From("document_pages").Insert(map[string]interface{}{
		"document_id": doc.ID,
		"page_number": 1,
		"text":        docxContent,
	}, false, "", "", "exact").Execute()
	
	if err != nil { return err }

	// Chunk and Embed
	chunks := p.chunkText(docxContent)
	if len(chunks) > 0 {
		embeddings, err := p.generateEmbeddings(chunks)
		if err != nil { return err }

		var chunkInserts []map[string]interface{}
		for idx, content := range chunks {
			data := map[string]interface{}{
				"document_id": doc.ID,
				"page_number": 1,
				"chunk_index": idx,
				"content":     content,
			}
			if len(embeddings) > idx {
				data["embedding"] = embeddings[idx]
			}
			chunkInserts = append(chunkInserts, data)
		}
		_, _, err = p.client.From("document_chunks").Insert(chunkInserts, false, "", "", "exact").Execute()
		if err != nil { return err }
	}

	p.client.From("documents").Update(map[string]interface{}{"pages_done": 1}, "", "").Eq("id", doc.ID).Execute()
	return nil
}

func (p *Processor) processPdf(doc Document, localPath string) error {
	// 3. Get Page Count & Validate using ledongthuc/pdf
	pdfFile, r, err := pdf.Open(localPath)
	if err != nil {
		return fmt.Errorf("invalid pdf: %v", err)
	}
	defer pdfFile.Close()
	pageCount := r.NumPage()
	
	// Update total pages
	_, _, err = p.client.From("documents").Update(map[string]interface{}{"pages_total": pageCount}, "", "").Eq("id", doc.ID).Execute()
	if err != nil {
		log.Println("Error updating pages_total:", err)
	}

	// 4. Process Pages Sequentially (to avoid 429 Rate Limits)
	// The free tier has distinct rate limits (15 RPM), so parallel processing triggers 429s immediately.
	const maxConcurrency = 1 
	sem := make(chan struct{}, maxConcurrency)
	var wg sync.WaitGroup
	errChan := make(chan error, pageCount)

	for i := 1; i <= pageCount; i++ {
		wg.Add(1)
		go func(pageNum int) {
			defer wg.Done()
			sem <- struct{}{}        // Acquire token
			defer func() { <-sem }() // Release token

            // Extract Text using Go library
            pageText, err := p.extractTextGo(localPath, pageNum)
			if err != nil {
				log.Printf("extract error page %d: %v", pageNum, err)
			}
            
            // Fallback: If empty, sparse (headers only), or contains garbage, try Gemini OCR
            cleanedText := strings.TrimSpace(pageText)
            // INCREASED THRESHOLD to 400 to catch more "image-heavy" pages with just headers
            if len(cleanedText) < 400 || p.isGarbageText(pageText) { 
                if p.isGarbageText(pageText) {
                    log.Printf("⚠️ Page %d detected as garbage text. Retrying with Gemini OCR...", pageNum)
                } else {
                    log.Printf("⚠️ Page %d has insufficient text (len=%d < 400). Retrying with Gemini OCR...", pageNum, len(cleanedText))
                }
                
                ocrText, errOCR := p.extractTextWithGemini(localPath, pageNum)
                if errOCR != nil {
                     log.Printf("❌ Gemini OCR failed for page %d: %v", pageNum, errOCR)
                } else {
                     log.Printf("✅ Gemini OCR success for page %d. Extracted %d chars", pageNum, len(ocrText))
                     pageText = ocrText
                }
            }


			// Save Page
			fmt.Printf("Saving page %d...\n", pageNum)
			
			// Delete existing data for idempotency (avoid upsert constraints issues)
			p.client.From("document_chunks").Delete("", "").Eq("document_id", doc.ID).Eq("page_number", fmt.Sprintf("%d", pageNum)).Execute()
			p.client.From("document_pages").Delete("", "").Eq("document_id", doc.ID).Eq("page_number", fmt.Sprintf("%d", pageNum)).Execute()

			_, _, err = p.client.From("document_pages").Insert(map[string]interface{}{
				"document_id": doc.ID,
				"page_number": pageNum,
				"text":        pageText,
			}, false, "", "", "exact").Execute()

			if err != nil {
				log.Printf("Failed to save page %d: %v", pageNum, err)
				errChan <- fmt.Errorf("page %d save failed: %w", pageNum, err)
				return
			}
			fmt.Printf("Page %d saved. Chunking...\n", pageNum)

			// Chunking & Embeddings & Batch Insert
			chunks := p.chunkText(pageText)
			fmt.Printf("Page %d chunks: %d\n", pageNum, len(chunks))
			if len(chunks) > 0 {
				var chunkInserts []map[string]interface{}
				
				// Generate embeddings
				fmt.Printf("Generating embeddings for page %d...\n", pageNum)
                embeddings, err := p.generateEmbeddings(chunks)
                if err != nil {
                     log.Printf("❌ Embedding error page %d: %v", pageNum, err)
                     // errChan <- fmt.Errorf("page %d embedding failed: %w", pageNum, err) 
                     // Don't fail the whole job for one embedding error? Maybe better to log and continue
                     // But for now, let's return error to be safe
                     errChan <- err
                     return
                }
                
				fmt.Printf("Generated %d embeddings for page %d\n", len(embeddings), pageNum)

				for idx, content := range chunks {
					data := map[string]interface{}{
						"document_id": doc.ID,
						"page_number": pageNum,
						"chunk_index": idx,
						"content":     content,
					}
					if len(embeddings) > idx {
					    data["embedding"] = embeddings[idx]
					}
					
					chunkInserts = append(chunkInserts, data)
				}

				fmt.Printf("Inserting %d chunks for page %d...\n", len(chunkInserts), pageNum)
				_, _, err = p.client.From("document_chunks").Insert(chunkInserts, false, "", "", "exact").Execute()
				if err != nil {
					log.Printf("❌ Failed to save chunks for page %d: %v", pageNum, err)
					errChan <- fmt.Errorf("page %d chunk insertion failed: %w", pageNum, err)
                    return
				}
				fmt.Printf("✅ Chunks inserted for page %d\n", pageNum)
			}

			// Update Progress
			if pageNum%5 == 0 || pageNum == pageCount {
				p.client.From("documents").Update(map[string]interface{}{"pages_done": pageNum}, "", "").Eq("id", doc.ID).Execute()
			}

		}(i)
	}

	wg.Wait()
	close(errChan)

	if len(errChan) > 0 {
		return <-errChan 
	}

	return nil
}

// Replaced implementation with pure Go
func (p *Processor) extractTextGo(path string, pageNum int) (string, error) {
    // pdf.Open returns (file, reader, error)
    pdfFile, r, err := pdf.Open(path)
    if err != nil {
        return "", err
    }
    defer pdfFile.Close()
    
    if pageNum > r.NumPage() {
        return "", fmt.Errorf("page out of range")
    }
    
    pObj := r.Page(pageNum)
    content, err := pObj.GetPlainText(nil)
    if err != nil {
        return "", err 
    }
    return content, nil
}

// extractTextWithGemini uses Gemini 1.5 Flash to perform OCR on a single PDF page
func (p *Processor) extractTextWithGemini(pdfPath string, pageNum int) (string, error) {
    if p.genAIClient == nil {
        return "", fmt.Errorf("genAI client not initialized")
    }

    // 1. Extract the single page to a temporary PDF file using pdfcpu
    pageTempDir, err := os.MkdirTemp("", fmt.Sprintf("gemini_ocr_page_%d_", pageNum))
    if err != nil {
        return "", err
    }
    defer os.RemoveAll(pageTempDir)

    conf := model.NewDefaultConfiguration()
    // Extract single page
    err = api.ExtractPagesFile(pdfPath, pageTempDir, []string{fmt.Sprintf("%d", pageNum)}, conf)
    if err != nil {
        return "", fmt.Errorf("failed to extract page %d: %w", pageNum, err)
    }

    // Find the extracted PDF file
    files, _ := os.ReadDir(pageTempDir)
    if len(files) == 0 {
        return "", fmt.Errorf("no page file extracted")
    }
    pagePdfPath := filepath.Join(pageTempDir, files[0].Name())

    // 2. Read PDF bytes
    pdfBytes, err := os.ReadFile(pagePdfPath)
    if err != nil {
        return "", err
    }

    // 3. Call Gemini 1.5 Flash for OCR
    model := p.genAIClient.GenerativeModel("gemini-1.5-flash-latest")
    
    // Set a prompt optimized for Indonesian document OCR
    prompt := "Ini adalah halaman dari dokumen peraturan PT KAI. Tolong ekstrak semua teks dari halaman ini secara akurat. Pertahankan struktur teks jika memungkinkan. Jangan tambahkan komentar apapun, hanya teks dari dokumen."
    
    ctx, cancel := context.WithTimeout(context.Background(), 1*time.Minute)
    defer cancel()

    resp, err := model.GenerateContent(ctx, 
        genai.Text(prompt),
        genai.Blob{MIMEType: "application/pdf", Data: pdfBytes},
    )
    if err != nil {
        return "", fmt.Errorf("gemini error: %w", err)
    }

    if len(resp.Candidates) == 0 || len(resp.Candidates[0].Content.Parts) == 0 {
        return "", fmt.Errorf("no text returned from gemini")
    }

    var result strings.Builder
    for _, part := range resp.Candidates[0].Content.Parts {
        if tex, ok := part.(genai.Text); ok {
            result.WriteString(string(tex))
        }
    }

    return strings.TrimSpace(result.String()), nil
}

// Removed extractTextWithOCR logic as it's replaced by Gemini-based OCR

// isGarbageText detects if the text is filled with scrambled symbols (encoding issues)
func (p *Processor) isGarbageText(text string) bool {
    if len(text) == 0 {
        return false
    }
    
    // Count alphanumeric vs others
    var alphaNum int
    for _, r := range text {
        if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == ' ' || r == '\n' || r == '\r' || r == '\t' {
            alphaNum++
        }
    }
    
    ratio := float64(alphaNum) / float64(len(text))
    // If less than 40% of characters are standard alphanumeric/whitespace, it's likely garbage encoding
    return ratio < 0.4
}

// Removed legacy pdfcpu/ocr implementations


func (p *Processor) chunkText(text string) []string {
	const size = 1000 // Reduced specifically for embedding context window safety
	const overlap = 100
	var chunks []string

	runes := []rune(text)
	if len(runes) == 0 {
		return chunks
	}

	for i := 0; i < len(runes); i += (size - overlap) {
		end := i + size
		if end > len(runes) {
			end = len(runes)
		}
		chunks = append(chunks, string(runes[i:end]))
		if end == len(runes) {
			break
		}
	}
	return chunks
}

func (p *Processor) generateEmbeddings(texts []string) ([][]float32, error) {
    if p.genAIClient == nil {
        return nil, fmt.Errorf("genAI client not initialized")
    }
    if len(texts) == 0 {
        return nil, nil
    }

    model := p.genAIClient.EmbeddingModel("text-embedding-004")
    batch := model.NewBatch()
    for _, text := range texts {
        batch.AddContent(genai.Text(text))
    }
    
    ctx := context.Background()
    resp, err := model.BatchEmbedContents(ctx, batch)
    if err != nil {
        return nil, err
    }
    
    var results [][]float32
    for _, e := range resp.Embeddings {
        results = append(results, e.Values)
    }
    return results, nil
}
