# Bunblebee Backend Server

微信小程序后端服务器，基于 Express.js 和 MySQL。

## 项目结构

```
bunblebee-backend-server/
├── app.js              # 应用入口文件
├── package.json        # 项目依赖配置
├── Dockerfile         # Docker 构建文件
└── .github/           # GitHub Actions 配置
```

## 本地开发

1. 安装依赖：

```bash
npm install
```

2. 启动开发服务器：

```bash
npm run dev
```

## 部署

项目使用 GitHub Actions 自动部署到微信云托管。每次推送到 main 分支时会自动触发部署。

## 环境变量

- `DB_HOST`: 数据库主机地址
- `DB_PORT`: 数据库端口
- `DB_USER`: 数据库用户名
- `DB_PASSWORD`: 数据库密码

## API 接口

- `GET /`: 欢迎页面
- `GET /test-db`: 测试数据库连接
