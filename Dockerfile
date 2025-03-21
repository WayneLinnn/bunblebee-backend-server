# 使用 Node.js 官方镜像作为基础镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 更新 Alpine 的包管理器并安装 ca-certificates
RUN apk update && \
    apk add --no-cache ca-certificates

# 安装 Node.js 和 npm，使用腾讯云镜像源提高下载速度
RUN npm config set registry https://mirrors.cloud.tencent.com/npm/

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm install

# 复制源代码
COPY . .

# 暴露端口
EXPOSE 80

# 启动命令
CMD ["node", "app.js"] 