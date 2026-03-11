#!/usr/bin/env bash
set -e

WORKSPACE="/workspaces/pixel-agent-"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║        Pixel Agent Office — Setup         ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── 1. Install agent dependencies ──────────────────────────────────────────
echo "📦 Installing agent dependencies..."
cd "$WORKSPACE/agent"
npm install --silent
npm run build
echo "   ✓ Agent ready"

# ── 2. Build and install pixel-agents VS Code extension ────────────────────
echo "🎮 Building pixel-agents extension..."
cd "$WORKSPACE/pixel-agents"
npm install --silent

# Install @vscode/vsce to package the extension
npm install --save-dev @vscode/vsce --silent 2>/dev/null || true

# Package the extension as a .vsix
npx vsce package --no-dependencies --out /tmp/pixel-agents.vsix 2>/dev/null
echo "   ✓ Extension packaged"

# Install the extension into VS Code (works in Codespaces browser VS Code)
if command -v code &>/dev/null; then
  code --install-extension /tmp/pixel-agents.vsix
  echo "   ✓ pixel-agents extension installed"
else
  echo "   ⚠ 'code' CLI not found — install .vsix manually from /tmp/pixel-agents.vsix"
fi

# ── 3. Create Claude projects directory so JSONL files have a home ──────────
mkdir -p "$HOME/.claude/projects"
echo "   ✓ Claude projects directory ready"

# ── Done ───────────────────────────────────────────────────────────────────
echo ""
echo "✅ Setup complete!"
echo ""
echo "   Your Pixel Agent Office is ready."
echo ""
echo "   To start the agent:"
echo "     cd agent && npm run dev"
echo ""
echo "   The pixel-agents panel will appear in VS Code automatically."
echo ""
echo "   ⚠ Make sure ANTHROPIC_API_KEY is set in:"
echo "     GitHub → Settings → Codespaces → Secrets"
echo ""
