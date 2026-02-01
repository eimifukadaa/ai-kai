import paramiko
import sys

# Configuration
HOST = "146.190.90.47"
USERNAME = "root"
PASSWORD = "Fujimori6Riho"
REMOTE_DIR = "/root/kai-chat"

def create_ssh_client():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(HOST, username=USERNAME, password=PASSWORD)
        return client
    except Exception as e:
        print(f"[-] Connection failed: {e}")
        sys.exit(1)

def run_command(client, command):
    print(f"\n[*] Running: {command}")
    stdin, stdout, stderr = client.exec_command(command)
    exit_status = stdout.channel.recv_exit_status()
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    
    if out:
        print(f"Output:\n{out}")
    if err:
        print(f"Error:\n{err}")
    
    return out, err, exit_status

def main():
    print("=== Checking Deployed Code ===\n")
    client = create_ssh_client()
    
    # Check if the fix is actually in the deployed code
    print("[1] Checking route.ts content on server...")
    run_command(client, f"grep -A 5 'filter_user_id' {REMOTE_DIR}/app/api/chat/send/route.ts || echo 'filter_user_id NOT FOUND (this is good!)'")
    
    # Check if .next build exists
    print("\n[2] Checking if .next build directory exists...")
    run_command(client, f"ls -la {REMOTE_DIR}/.next/server/app/api/chat/send/route.js 2>&1 || echo 'Build file not found!'")
    
    # Check service status
    print("\n[3] Checking service status...")
    run_command(client, "systemctl status kai-chat-web --no-pager | head -20")
    
    # Check service logs for errors
    print("\n[4] Checking recent logs...")
    run_command(client, "journalctl -u kai-chat-web -n 50 --no-pager")
    
    # Check if .env.local exists on server
    print("\n[5] Checking .env.local on server...")
    run_command(client, f"ls -la {REMOTE_DIR}/.env.local")
    
    client.close()

if __name__ == "__main__":
    main()
