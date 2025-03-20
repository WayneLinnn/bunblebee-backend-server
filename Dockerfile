# 使用 Alpine 作为基础镜像
FROM alpine:3.13

# 使用 HTTPS 协议访问容器云调用证书安装
RUN apk add ca-certificates

# 安装 Node.js 和 npm，使用腾讯云镜像源提高下载速度
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tencent.com/g' /etc/apk/repositories \
    && apk add --update --no-cache nodejs npm

# 设置工作目录
WORKDIR /app

# 拷贝包管理文件
COPY package*.json /app/

# 设置 npm 使用腾讯云镜像源
RUN npm config set registry https://mirrors.cloud.tencent.com/npm/

# 安装依赖
RUN npm install

# 将所有文件拷贝到工作目录
COPY . /app

# 暴露端口
EXPOSE 80

# 启动应用
CMD ["npm", "start"] 