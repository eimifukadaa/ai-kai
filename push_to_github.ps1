$ErrorActionPreference = "Stop"

Write-Host "--- Configuring Git Remote ---"

# 1. Check if remote exists, remove if it does (to be safe/clean), then add
try {
    git remote remove target_repo
} catch {
    # Ignore error if it doesn't exist
}

# Add the requested remote
git remote add target_repo "https://github.com/eimifukadaa/ai-kai.git"
Write-Host "[+] Remote 'target_repo' added."

# 2. Checkout the 'peron' branch
# Try to switch to it, or create it if it doesn't exist
try {
    git checkout peron
} catch {
    Write-Host "[*] Creating branch 'peron'..."
    git checkout -b peron
}

# 3. Add and Commit
Write-Host "[*] Adding all files..."
git add .

# Check if there are changes to commit
$status = git status --porcelain
if ($status) {
    Write-Host "[*] Committing changes..."
    git commit -m "Update: Implement DOCX support and fix PDF OCR (Aggressive Mode)"
} else {
    Write-Host "[*] No new changes to commit."
}

# 4. Push
Write-Host "[*] Pushing to target_repo/peron..."
# Note: This might prompt for credentials if not authenticated. 
# We assume the user has creds helper or we'll see the error.
git push -u target_repo peron

Write-Host "--- Done! ---"
