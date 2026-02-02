import paramiko
import os
import sys
import time

# ================= CONFIG =================
HOST = "146.190.90.47"
USERNAME = "root"
PASSWORD = "Fujimori6Riho"

REMOTE_DIR = "/root/kai-chat"
LOCAL_DIR = os.getcwd()

APP_NAME = "kai-chat"
PORT = 3005

# Exclude
EXCLUDE_DIRS = {
    ".git", "node_modules", ".next", "tmp",
    "brain", ".gemini", ".agent", "worker/tmp"
}
EXCLUDE_FILES = {
    "deploy.py", "deploy_pm2_kai_chat.py",
    "task.md", "implementation_plan.md", "walkthrough.md"
}
# =========================================


def ssh_connect():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(HOST, username=USERNAME, password=PASSWORD)
        client.get_transport().set_keepalive(30)
        return client
    except Exception as e:
        print("❌ SSH FAILED:", e)
        sys.exit(1)


def run(client, cmd, ignore=False):
    print(f"\n▶ {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd)
    exit_code = stdout.channel.recv_exit_status()

    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()

    if out:
        print(out)
    if err and not ignore:
        print("⚠️", err)

    if exit_code != 0 and not ignore:
        print("❌ COMMAND FAILED")
        sys.exit(1)

    return out


def upload_code(client):
    print("\n🚀 Uploading source code...")
    sftp = client.open_sftp()

    try:
        sftp.stat(REMOTE_DIR)
    except IOError:
        sftp.mkdir(REMOTE_DIR)

    for root, dirs, files in os.walk(LOCAL_DIR):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]

        rel = os.path.relpath(root, LOCAL_DIR)
        remote_path = REMOTE_DIR if rel == "." else f"{REMOTE_DIR}/{rel}"

        try:
            sftp.stat(remote_path)
        except IOError:
            sftp.mkdir(remote_path)

        for f in files:
            if f in EXCLUDE_FILES:
                continue

            local_file = os.path.join(root, f)
            remote_file = f"{remote_path}/{f}"
            sftp.put(local_file, remote_file)

    sftp.close()
    print("✅ Upload complete")


def ensure_pm2(client):
    run(client, "pm2 -v", ignore=True)
    run(client, "npm install -g pm2", ignore=True)


def build_app(client):
    print("\n🏗️ Building app (CLEAN BUILD)...")
    # Clean previous build to enforce updates
    run(client, f"cd {REMOTE_DIR} && rm -rf .next")
    run(client, f"cd {REMOTE_DIR} && npm install")
    run(client, f"cd {REMOTE_DIR} && npm run build")


def restart_pm2(client):
    print("\n🔁 Restarting PM2 app...")

    # Force delete and start to ensure environment and code are fresh
    run(client, f"pm2 delete {APP_NAME}", ignore=True)
    
    run(
        client,
        f"cd {REMOTE_DIR} && pm2 start npm "
        f"--name {APP_NAME} -- start -- -p {PORT}"
    )

    run(client, "pm2 save")


def health_check(client):
    print("\n🩺 Health check...")
    run(client, "pm2 status")
    run(client, f"ss -tulpn | grep {PORT}", ignore=True)


def main():
    print("\n===== 🚀 KAI CHAT DEPLOY (PM2 SAFE) =====")

    client = ssh_connect()

    upload_code(client)
    ensure_pm2(client)
    build_app(client)
    restart_pm2(client)
    health_check(client)

    print("\n✅ DEPLOYMENT DONE")
    print(f"🌐 Access: http://{HOST}:8090")
    client.close()


if __name__ == "__main__":
    main()
