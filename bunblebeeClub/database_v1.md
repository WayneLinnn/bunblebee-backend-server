# 青少年足球俱乐部数据库设计

## **数据库表结构**

### **1. 用户表（users）**

```sql
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    openid VARCHAR(50) UNIQUE NOT NULL,  -- 微信用户唯一标识
    nickname VARCHAR(100),  -- 微信昵称
    avatar_url VARCHAR(255),  -- 头像链接
    phone VARCHAR(20),  -- 联系电话
    role ENUM('student', 'coach', 'admin') NOT NULL DEFAULT 'student',  -- 用户角色
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### **2. 课程表（courses）**

```sql
CREATE TABLE courses (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,  -- 课程名称
    description TEXT,  -- 课程描述
    total_sessions INT NOT NULL,  -- 课程总课时
    price DECIMAL(10,2) NOT NULL,  -- 课程价格
    expiry_date DATE,  -- 课程有效期
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### **3. 用户课程表（user_courses）**

```sql
CREATE TABLE user_courses (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    course_id INT NOT NULL,
    remaining_sessions INT NOT NULL,  -- 剩余课时
    enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (course_id) REFERENCES courses(id)
);
```

### **4. 教练表（coaches）**

```sql
CREATE TABLE coaches (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT UNIQUE NOT NULL,
    experience INT NOT NULL,  -- 教练教龄
    age INT NOT NULL,  -- 年龄
    honors TEXT,  -- 获得荣誉
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### **5. 成就类型表（achievements）**

```sql
CREATE TABLE achievements (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,  -- 成就名称
    description TEXT,  -- 成就描述
    points INT NOT NULL,  -- 该成就奖励的积分
    experience INT NOT NULL,  -- 该成就奖励的经验值
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### **6. 用户成就表（user_achievements）**

```sql
CREATE TABLE user_achievements (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    achievement_id INT NOT NULL,
    achieved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (achievement_id) REFERENCES achievements(id)
);
```

### **7. 订单表（orders）**

```sql
CREATE TABLE orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    status ENUM('pending', 'paid', 'cancelled') DEFAULT 'pending',  -- 订单状态
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### **8. 商品表（products）**

```sql
CREATE TABLE products (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,  -- 商品名称
    description TEXT,  -- 商品描述
    price DECIMAL(10,2) NOT NULL,  -- 商品价格
    stock INT NOT NULL,  -- 商品库存
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### **9. 用户订单表（user_orders）**

```sql
CREATE TABLE user_orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    order_id INT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (order_id) REFERENCES orders(id)
);
```

### **10. 场地表（fields）**

```sql
CREATE TABLE fields (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,  -- 场地名称
    location VARCHAR(255),  -- 场地位置
    price_per_hour DECIMAL(10,2) NOT NULL,  -- 每小时租金
    available_from TIME,  -- 可预订起始时间
    available_to TIME,  -- 可预订结束时间
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### **11. 场地预订表（reservations）**

```sql
CREATE TABLE reservations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    field_id INT NOT NULL,
    reservation_date DATE NOT NULL,  -- 预订日期
    start_time TIME NOT NULL,  -- 开始时间
    end_time TIME NOT NULL,  -- 结束时间
    status ENUM('pending', 'confirmed', 'cancelled') DEFAULT 'pending',  -- 预订状态
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (field_id) REFERENCES fields(id)
);
```

## **使用方式**

1. **执行数据库脚本**

   - 你可以将所有 `CREATE TABLE` 语句保存到 `database.sql` 文件中。
   - 在 MySQL 数据库中执行：
     ```sh
     mysql -u your_username -p your_database < database.sql
     ```

2. **未来扩展**

   - **成就系统** 可以通过 `achievements` 表自由添加新成就，而不需要修改数据库结构。
   - **支持多种身份**，一个小程序可以兼容学生、教练和管理员。
   - **课程管理可扩展**，你可以增加课程分类或更多元的报名系统。
   - **场地预定可以扩展**，如增加多个时段预约，甚至未来在线支付。

这样，你的数据库就能支持 **灵活扩展**，适应未来需求！🚀
