# 使用 Node.js 18 作为基础镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 设置 npm 镜像为淘宝镜像
RUN npm config set registry https://registry.npmmirror.com
RUN npm config set fetch-retries 3
RUN npm config set fetch-retry-mintimeout 60000
RUN npm config set fetch-retry-maxtimeout 180000

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm install --no-package-lock --network-timeout 1000000

# 复制源代码
COPY . .

# 暴露端口
EXPOSE 80

# 启动应用
CMD ["npm", "start"] 