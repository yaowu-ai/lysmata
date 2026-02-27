/**
 * OpenClaw installation API
 * Provides one-click installation of OpenClaw on macOS
 */

import { Hono } from 'hono';
import { stream } from 'hono/streaming';

const app = new Hono();

interface InstallEvent {
  step?: string;
  message?: string;
  progress?: number;
  log?: string;
  error?: string;
  success?: boolean;
}

async function checkEnvironment(): Promise<{ canInstall: boolean; message: string; details?: Record<string, unknown> }> {
  try {
    // Check if running on macOS
    if (process.platform !== 'darwin') {
      return {
        canInstall: false,
        message: '当前仅支持 macOS 系统安装',
      };
    }

    // Check if Homebrew is installed
    const brewCheck = await Bun.spawn(['which', 'brew']).exited;
    const hasHomebrew = brewCheck === 0;

    // Check if curl is available
    const curlCheck = await Bun.spawn(['which', 'curl']).exited;
    const hasCurl = curlCheck === 0;

    if (!hasHomebrew && !hasCurl) {
      return {
        canInstall: false,
        message: '系统缺少必要工具。请先安装 Homebrew 或确保 curl 可用。',
      };
    }

    return {
      canInstall: true,
      message: '系统环境检查通过',
      details: {
        platform: process.platform,
        hasHomebrew,
        hasCurl,
      },
    };
  } catch (err) {
    return {
      canInstall: false,
      message: `环境检查失败: ${String(err)}`,
    };
  }
}

async function installOpenClaw(sendEvent: (event: InstallEvent) => void): Promise<void> {
  try {
    // Step 1: Check if already installed
    sendEvent({ step: 'checking', message: '检查 OpenClaw 安装状态...', progress: 10 });
    sendEvent({ log: '检查是否已安装 OpenClaw' });

    const checkInstalled = await Bun.spawn(['which', 'openclaw']).exited;
    if (checkInstalled === 0) {
      sendEvent({ log: 'OpenClaw 已安装，检查版本' });
      const versionProc = Bun.spawn(['openclaw', '--version'], {
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const versionText = await new Response(versionProc.stdout).text();
      sendEvent({ log: `当前版本: ${versionText.trim()}` });
      sendEvent({ step: 'success', message: 'OpenClaw 已安装', progress: 100 });
      sendEvent({ success: true });
      return;
    }

    // Step 2: Try Homebrew installation first
    sendEvent({ step: 'downloading', message: '尝试通过 Homebrew 安装...', progress: 30 });
    sendEvent({ log: '检查 Homebrew 可用性' });

    const brewCheck = await Bun.spawn(['which', 'brew']).exited;
    
    if (brewCheck === 0) {
      sendEvent({ log: '使用 Homebrew 安装 OpenClaw' });
      sendEvent({ log: '注意：OpenClaw 可能没有官方 Homebrew formula' });
      sendEvent({ log: '请参考手动安装说明' });
      
      throw new Error('OpenClaw 暂不支持 Homebrew 自动安装，请使用手动安装方式');
    } else {
      throw new Error('未找到 Homebrew，请先安装 Homebrew 或参考手动安装说明');
    }

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    sendEvent({ error: errorMsg });
    sendEvent({ log: `安装失败: ${errorMsg}` });
    throw err;
  }
}

async function manualInstall(sendEvent: (event: InstallEvent) => void): Promise<void> {
  sendEvent({ log: '开始手动安装流程' });
  sendEvent({ step: 'downloading', message: '下载 OpenClaw...', progress: 40 });

  const homeDir = process.env.HOME;
  if (!homeDir) {
    throw new Error('无法获取用户主目录');
  }
  
  const installDir = `${homeDir}/.openclaw/bin`;
  const binaryPath = `${installDir}/openclaw`;

  // Create installation directory
  await Bun.spawn(['mkdir', '-p', installDir]).exited;
  sendEvent({ log: `创建安装目录: ${installDir}` });

  // Download OpenClaw binary
  // Note: This is a placeholder URL - adjust based on actual OpenClaw releases
  const downloadUrl = 'https://github.com/openclaw/openclaw/releases/latest/download/openclaw-macos-arm64';
  
  sendEvent({ log: `下载 OpenClaw: ${downloadUrl}` });

  const downloadProc = Bun.spawn(['curl', '-L', '-o', binaryPath, downloadUrl], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stderr = await new Response(downloadProc.stderr).text();
  if (stderr) sendEvent({ log: stderr });

  const downloadExitCode = await downloadProc.exited;

  if (downloadExitCode !== 0) {
    throw new Error('下载 OpenClaw 二进制文件失败');
  }

  sendEvent({ log: 'OpenClaw 下载完成' });
  sendEvent({ step: 'installing', message: '设置执行权限...', progress: 60 });

  // Make binary executable
  await Bun.spawn(['chmod', '+x', binaryPath]).exited;
  sendEvent({ log: '已设置执行权限' });

  // Add to PATH by updating shell profile
  sendEvent({ step: 'installing', message: '配置环境变量...', progress: 70 });
  
  const shellProfile = `${homeDir}/.zshrc`;
  const pathExport = `\n# OpenClaw\nexport PATH="$HOME/.openclaw/bin:$PATH"\n`;
  
  // Check if already in PATH
  const profileFile = Bun.file(shellProfile);
  const profileExists = await profileFile.exists();
  
  if (profileExists) {
    const content = await profileFile.text();
    if (!content.includes('.openclaw/bin')) {
      await Bun.write(shellProfile, content + pathExport);
      sendEvent({ log: '已添加到 PATH (需要重启终端生效)' });
    } else {
      sendEvent({ log: 'PATH 已配置' });
    }
  } else {
    await Bun.write(shellProfile, pathExport);
    sendEvent({ log: '已创建 shell 配置文件' });
  }

  sendEvent({ log: '手动安装完成' });
}

async function initializeConfig(sendEvent: (event: InstallEvent) => void): Promise<void> {
  const homeDir = process.env.HOME;
  if (!homeDir) {
    throw new Error('无法获取用户主目录');
  }
  
  const openclawDir = `${homeDir}/.openclaw`;
  const configPath = `${openclawDir}/openclaw.json`;

  sendEvent({ log: `配置目录: ${openclawDir}` });

  // Create .openclaw directory if it doesn't exist
  await Bun.spawn(['mkdir', '-p', openclawDir]).exited;

  // Check if config already exists
  const configFile = Bun.file(configPath);
  const configExists = await configFile.exists();

  if (configExists) {
    sendEvent({ log: '配置文件已存在，跳过初始化' });
    return;
  }

  // Create default configuration
  const defaultConfig = {
    meta: {
      lastTouchedVersion: '1.0.0',
      lastTouchedAt: new Date().toISOString(),
    },
    gateway: {
      port: 8080,
      mode: 'local',
      auth: {
        mode: 'token',
        token: generateToken(),
      },
    },
    agents: {
      defaults: {
        model: {
          primary: 'openai/gpt-4o',
          fallbacks: [],
        },
        workspace: `${homeDir}/openclaw-workspace`,
      },
    },
    auth: {
      profiles: {},
    },
  };

  await Bun.write(configPath, JSON.stringify(defaultConfig, null, 2));
  sendEvent({ log: `配置文件已创建: ${configPath}` });
}

function generateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

// Routes
app.get('/check-environment', async (c) => {
  const result = await checkEnvironment();
  return c.json(result);
});

app.post('/install', async (c) => {
  return stream(c, async (stream) => {
    const encoder = new TextEncoder();

    const sendEvent = (event: InstallEvent) => {
      const data = `data: ${JSON.stringify(event)}\n\n`;
      stream.write(encoder.encode(data));
    };

    // Send keepalive every 5 seconds
    const keepaliveTimer = setInterval(() => {
      stream.write(encoder.encode(': keepalive\n\n'));
    }, 5000);

    try {
      await installOpenClaw(sendEvent);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      sendEvent({ error: errorMsg });
    } finally {
      clearInterval(keepaliveTimer);
    }
  });
});

export default app;
