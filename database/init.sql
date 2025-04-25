-- 创建用户表
CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    openid VARCHAR(100) UNIQUE NOT NULL,
    nickname VARCHAR(50),
    avatar_url TEXT,
    gender TINYINT,
    phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 创建成就表
CREATE TABLE IF NOT EXISTS achievements (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon_url TEXT,
    points INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 创建用户成就关联表
CREATE TABLE IF NOT EXISTS user_achievements (
    user_id INT,
    achievement_id INT,
    earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, achievement_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (achievement_id) REFERENCES achievements(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 创建课程表
CREATE TABLE IF NOT EXISTS courses (
    id INT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    duration INT, -- 课程时长（分钟）
    max_students INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 创建用户课程关联表（购买记录）
CREATE TABLE IF NOT EXISTS user_courses (
    user_id INT,
    course_id INT,
    purchase_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('active', 'completed', 'cancelled') DEFAULT 'active',
    PRIMARY KEY (user_id, course_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (course_id) REFERENCES courses(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 创建预订表
CREATE TABLE reservations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    field_id INT NOT NULL,
    reservation_date DATE NOT NULL,  -- 预订日期
    start_time TIME NOT NULL,  -- 开始时间
    end_time TIME NOT NULL,  -- 结束时间
    status ENUM('pending', 'confirmed', 'cancelled', 'locked', 'completed') DEFAULT 'pending',  -- 预订状态
    total_price DECIMAL(10,2),  -- 预订总价
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (field_id) REFERENCES fields(id)
); 