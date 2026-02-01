import paramiko
import os
import time
import sys

# Configuration
HOST = "146.190.90.47"
USERNAME = "root"
PASSWORD = "Fujimori6Riho"
REMOTE_DIR = "/root/kai-chat"
LOCAL_DIR = os.getcwd()
INTERNAL_PORT = 3005
EXTERNAL_PORT = 8090

# Exclusions for file upload
EXCLUDE_DIRS = {'.git', 'node_modules', '.next', 'tmp', 'brain', '.gemini', '.agent', 'worker/tmp'}
EXCLUDE_FILES = {'deploy_kai_chat.py', 'deploy.py', 'task.md', 'implementation_plan.md', 'walkthrough.md'}

def create_ssh_client():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(HOST, username=USERNAME, password=PASSWORD)
        return client
    except Exception as e:
        print(f"[-] Connection failed: {e}")
        sys.exit(1)

def run_command(client, command, ignore_error=False):
    print(f"[*] Running: {command}")
    stdin, stdout, stderr = client.exec_command(command)
    exit_status = stdout.channel.recv_exit_status()
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    
    if exit_status != 0 and not ignore_error:
        print(f"[-] Command failed: {command}")
        print(f"Error: {err}")
        # sys.exit(1) # Don't exit immediately, let the caller handle or continue if safe
    elif exit_status == 0:
        if out: print(f"Output: {out}")
    
    return out, err, exit_status

def upload_files(client):
    sftp = client.open_sftp()
    
    # Ensure remote dir exists
    try:
        sftp.stat(REMOTE_DIR)
    except IOError:
        sftp.mkdir(REMOTE_DIR)

    print(f"[*] Uploading files to {REMOTE_DIR}...")
    
    for root, dirs, files in os.walk(LOCAL_DIR):
        # Filter exclusions
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        
        rel_path = os.path.relpath(root, LOCAL_DIR)
        remote_path = os.path.join(REMOTE_DIR, rel_path).replace("\\", "/")
        
        if rel_path == ".":
            remote_path = REMOTE_DIR
        
        # Create remote dir if needed
        try:
            sftp.stat(remote_path)
        except IOError:
            sftp.mkdir(remote_path)

        for file in files:
            if file in EXCLUDE_FILES:
                continue
                
            local_file = os.path.join(root, file)
            remote_file = os.path.join(remote_path, file).replace("\\", "/")
            
            # Simple timestamp check to avoid re-uploading unchanged files could be added here
            # For now, just upload
            # print(f"Uploading {file}...")
            sftp.put(local_file, remote_file)
    
    print("[+] Upload complete.")
    sftp.close()

def setup_services(client):
    # 1. Check/Install Node.js
    print("[*] Checking Node.js...")
    out, _, code = run_command(client, "node -v", ignore_error=True)
    if code != 0:
        print("[*] Installing Node.js (via NVM)...")
        # Install NVM and Node 20
        run_command(client, "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash")
        # Load nvm
        load_nvm = 'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh"'
        run_command(client, f'{load_nvm} && nvm install 20')
        run_command(client, f'{load_nvm} && nvm use 20')
        run_command(client, f'{load_nvm} && nvm alias default 20')

    # Find node path
    node_path = "/usr/bin/node" # Fallback
    out, _, code = run_command(client, "which node", ignore_error=True)
    if code == 0 and out:
        node_path = out
    # If using NVM, it might be tricky to get the path for systemd. 
    # Let's try to resolve it explicitly if it looks like nvm
    if not out:
         # Try to find it in nvm
         out, _, _ = run_command(client, 'find /root/.nvm -name node -type f | grep "v20" | head -n 1', ignore_error=True)
         if out: node_path = out

    # 2. Check/Install Go
    print("[*] Checking Go...")
    out, _, code = run_command(client, "go version", ignore_error=True)
    if code != 0:
        print("[*] Installing Go...")
        run_command(client, "snap install go --classic")

    # 3. Check/Install Nginx
    print("[*] Checking Nginx...")
    out, _, code = run_command(client, "nginx -v", ignore_error=True)
    if code != 0:
        print("[*] Installing Nginx...")
        run_command(client, "apt-get update && apt-get install -y nginx")

    # 4. Build Application
    print("[*] Building Next.js App...")
    # We need to run npm install and build. 
    run_command(client, f"cd {REMOTE_DIR} && npm install")
    run_command(client, f"cd {REMOTE_DIR} && npm run build")

    print("[*] Building Go Worker...")
    # Go mod is in worker/ directory
    run_command(client, f"cd {REMOTE_DIR}/worker && go mod tidy && go build -o ../worker-app .")

    # 5. Create Systemd Services
    print("[*] Creating Systemd Services...")
    
    # Web Service
    web_service = f"""[Unit]
Description=Kai Chat Web
After=network.target

[Service]
User=root
WorkingDirectory={REMOTE_DIR}
ExecStart={node_path} node_modules/next/dist/bin/next start -p {INTERNAL_PORT}
Restart=always
Environment=NODE_ENV=production
Environment=PORT={INTERNAL_PORT}

[Install]
WantedBy=multi-user.target
"""
    create_remote_file(client, "/etc/systemd/system/kai-chat-web.service", web_service)

    # Worker Service
    worker_service = f"""[Unit]
Description=Kai Chat Worker
After=network.target

[Service]
User=root
WorkingDirectory={REMOTE_DIR}
ExecStart={REMOTE_DIR}/worker-app
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
"""
    create_remote_file(client, "/etc/systemd/system/kai-chat-worker.service", worker_service)

    run_command(client, "systemctl daemon-reload")
    run_command(client, "systemctl enable kai-chat-web kai-chat-worker")
    run_command(client, "systemctl restart kai-chat-web kai-chat-worker")

    # 6. Configure Nginx
    print("[*] Configuring Nginx...")
    nginx_conf = f"""server {{
    listen {EXTERNAL_PORT};
    server_name _;

    location / {{
        proxy_pass http://localhost:{INTERNAL_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }}
}}
"""
    create_remote_file(client, "/etc/nginx/sites-available/kai-chat", nginx_conf)
    run_command(client, "ln -sf /etc/nginx/sites-available/kai-chat /etc/nginx/sites-enabled/")
    run_command(client, "nginx -t")
    run_command(client, "systemctl reload nginx")

def create_remote_file(client, path, content):
    sftp = client.open_sftp()
    with sftp.file(path, 'w') as f:
        f.write(content)
    sftp.close()

def main():
    print("--- Starting Deployment: Bug Fix Update ---")
    print("[*] This will upload the fixed route.ts and rebuild the app")
    client = create_ssh_client()
    # Enable keepalive to prevent timeout during long builds
    client.get_transport().set_keepalive(30)
    
    # Upload all files (including the fixed route.ts)
    upload_files(client)
    
    # Rebuild and restart services
    rebuild_and_restart(client)
    
    print("\n--- Deployment Finished ---")
    print(f"App should be live at: http://{HOST}:{EXTERNAL_PORT}")
    print("\n[!] Please test the chat by asking: 'krl adalah?'")
    print("[!] It should now return actual document content instead of 'TIDAK DITEMUKAN'")
    client.close()

def rebuild_and_restart(client):
    """Quick rebuild and restart for code updates"""
    print("[*] Rebuilding Next.js App...")
    run_command(client, f"cd {REMOTE_DIR} && npm run build")
    
    print("[*] Restarting services...")
    run_command(client, "systemctl restart kai-chat-web kai-chat-worker")
    
    print("[*] Checking service status...")
    run_command(client, "systemctl status kai-chat-web --no-pager", ignore_error=True)
    run_command(client, "systemctl status kai-chat-worker --no-pager", ignore_error=True)

if __name__ == "__main__":
    main()
