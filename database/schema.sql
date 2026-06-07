CREATE DATABASE IF NOT EXISTS edu_live_classroom CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE edu_live_classroom;

SET @db = DATABASE();

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(40) NOT NULL,
  organization_id BIGINT UNSIGNED NULL,
  district_id BIGINT UNSIGNED NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_users_full_name (full_name)
);

CREATE TABLE IF NOT EXISTS districts (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NULL,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(60) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS organizations (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  district_id BIGINT UNSIGNED NULL,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(60) NOT NULL UNIQUE,
  category VARCHAR(40) NOT NULL DEFAULT 'school',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_organization_district FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS fixed_classrooms (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  district_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(60) NOT NULL,
  assistant_user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_classroom_code (organization_id, code),
  CONSTRAINT fk_classroom_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_classroom_district FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  role_name VARCHAR(40) NOT NULL,
  permission_key VARCHAR(80) NOT NULL,
  permission_value TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_role_permission (role_name, permission_key)
);

CREATE TABLE IF NOT EXISTS system_settings (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  setting_key VARCHAR(80) NOT NULL UNIQUE,
  setting_value TEXT NULL,
  category VARCHAR(40) NOT NULL DEFAULT 'general',
  updated_by BIGINT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  actor_user_id BIGINT UNSIGNED NULL,
  action VARCHAR(80) NOT NULL,
  resource_type VARCHAR(80) NOT NULL,
  resource_id BIGINT UNSIGNED NULL,
  detail JSON NULL,
  ip_address VARCHAR(80) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_created_at (created_at),
  INDEX idx_audit_actor (actor_user_id)
);

CREATE TABLE IF NOT EXISTS courses (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NULL,
  district_id BIGINT UNSIGNED NULL,
  classroom_id BIGINT UNSIGNED NULL,
  title VARCHAR(180) NOT NULL,
  subject VARCHAR(120) NULL,
  teacher_name VARCHAR(120) NOT NULL,
  teacher_user_id BIGINT UNSIGNED NULL,
  assistant_name VARCHAR(120) NULL,
  assistant_user_id BIGINT UNSIGNED NULL,
  created_by_user_id BIGINT UNSIGNED NULL,
  price_cents INT UNSIGNED NOT NULL DEFAULT 0,
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  meeting_url VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS live_rooms (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  course_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  meeting_url VARCHAR(500) NOT NULL,
  created_by_user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_live_room_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS guardian_student_links (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  parent_user_id BIGINT UNSIGNED NOT NULL,
  student_user_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_guardian_student (parent_user_id, student_user_id),
  CONSTRAINT fk_guardian_parent FOREIGN KEY (parent_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_guardian_student FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS course_purchases (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  course_id BIGINT UNSIGNED NOT NULL,
  buyer_user_id BIGINT UNSIGNED NOT NULL,
  student_user_id BIGINT UNSIGNED NOT NULL,
  amount_cents INT UNSIGNED NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'paid',
  purchased_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_course_student_paid (course_id, student_user_id, status),
  CONSTRAINT fk_purchase_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_purchase_buyer FOREIGN KEY (buyer_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_purchase_student FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attendance (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  course_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  check_in_at DATETIME NOT NULL,
  check_out_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_attendance_course FOREIGN KEY (course_id) REFERENCES courses(id),
  CONSTRAINT fk_attendance_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS course_enrollments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  course_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_course_user (course_id, user_id),
  CONSTRAINT fk_enrollment_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_enrollment_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS course_replays (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  course_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  replay_url VARCHAR(500) NOT NULL,
  duration_seconds INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_replay_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

INSERT INTO users (full_name, email, password_hash, role)
VALUES ('Admin User', 'admin@example.com', '$2a$10$QwQ3vq2zMw2XkV4hIqV6Ue7YfPyD2Q4y0hRt0t.eoDWFj7R96LJ5O', 'admin')
ON DUPLICATE KEY UPDATE email = email;

ALTER TABLE users
  MODIFY COLUMN role VARCHAR(40) NOT NULL;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'email' AND is_nullable = 'NO'
  ),
  'ALTER TABLE users MODIFY COLUMN email VARCHAR(160) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS sales_agents (
  sales_user_id BIGINT UNSIGNED PRIMARY KEY,
  parent_sales_user_id BIGINT UNSIGNED NULL,
  organization_id BIGINT UNSIGNED NOT NULL,
  level_no TINYINT UNSIGNED NOT NULL DEFAULT 1,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sales_agent_user FOREIGN KEY (sales_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_sales_agent_parent FOREIGN KEY (parent_sales_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_agent_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  INDEX idx_sales_agent_org_parent (organization_id, parent_sales_user_id),
  INDEX idx_sales_agent_level (organization_id, level_no)
);

CREATE TABLE IF NOT EXISTS student_sales_bindings (
  student_user_id BIGINT UNSIGNED PRIMARY KEY,
  sales_agent_user_id BIGINT UNSIGNED NOT NULL,
  assigned_by_user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_student_sales_student FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_student_sales_agent FOREIGN KEY (sales_agent_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_student_sales_assigned_by FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_student_sales_agent (sales_agent_user_id)
);

CREATE TABLE IF NOT EXISTS sales_commission_rules (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NULL,
  level_no TINYINT UNSIGNED NOT NULL,
  tier_no TINYINT UNSIGNED NOT NULL,
  min_sales_cents BIGINT UNSIGNED NOT NULL DEFAULT 0,
  max_sales_cents BIGINT UNSIGNED NULL,
  rate_bps INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_sales_commission_rule (organization_id, level_no, tier_no),
  INDEX idx_sales_commission_lookup (organization_id, level_no, min_sales_cents),
  CONSTRAINT fk_sales_commission_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sales_orders (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  order_no VARCHAR(48) NOT NULL UNIQUE,
  course_id BIGINT UNSIGNED NOT NULL,
  organization_id BIGINT UNSIGNED NULL,
  district_id BIGINT UNSIGNED NULL,
  buyer_user_id BIGINT UNSIGNED NOT NULL,
  student_user_id BIGINT UNSIGNED NOT NULL,
  sales_agent_user_id BIGINT UNSIGNED NULL,
  amount_cents INT UNSIGNED NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  payment_channel VARCHAR(40) NOT NULL DEFAULT 'wechat',
  source VARCHAR(40) NOT NULL DEFAULT 'purchase',
  wechat_transaction_id VARCHAR(80) NULL,
  detail JSON NULL,
  notify_payload JSON NULL,
  created_by_user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at DATETIME NULL,
  CONSTRAINT fk_sales_order_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_sales_order_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_order_district FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_order_buyer FOREIGN KEY (buyer_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_sales_order_student FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_sales_order_agent FOREIGN KEY (sales_agent_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_order_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_sales_order_scope (organization_id, district_id, status),
  INDEX idx_sales_order_buyer (buyer_user_id),
  INDEX idx_sales_order_student (student_user_id),
  INDEX idx_sales_order_agent_paid (sales_agent_user_id, paid_at)
);

CREATE TABLE IF NOT EXISTS sales_order_commissions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  beneficiary_user_id BIGINT UNSIGNED NOT NULL,
  level_no TINYINT UNSIGNED NOT NULL,
  tier_no TINYINT UNSIGNED NOT NULL,
  rate_bps INT UNSIGNED NOT NULL DEFAULT 0,
  team_sales_cents BIGINT UNSIGNED NOT NULL DEFAULT 0,
  commission_cents INT UNSIGNED NOT NULL DEFAULT 0,
  detail JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_sales_order_level_beneficiary (order_id, beneficiary_user_id, level_no),
  CONSTRAINT fk_sales_commission_order FOREIGN KEY (order_id) REFERENCES sales_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_sales_commission_user FOREIGN KEY (beneficiary_user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_sales_commission_beneficiary (beneficiary_user_id, created_at)
);

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = @db AND table_name = 'sales_agents'
  ),
  'SELECT 1',
  'CREATE TABLE sales_agents (
     sales_user_id BIGINT UNSIGNED PRIMARY KEY,
     parent_sales_user_id BIGINT UNSIGNED NULL,
     organization_id BIGINT UNSIGNED NOT NULL,
     level_no TINYINT UNSIGNED NOT NULL DEFAULT 1,
     active TINYINT(1) NOT NULL DEFAULT 1,
     created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     INDEX idx_sales_agent_org_parent (organization_id, parent_sales_user_id),
     INDEX idx_sales_agent_level (organization_id, level_no)
   )'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = @db AND table_name = 'student_sales_bindings'
  ),
  'SELECT 1',
  'CREATE TABLE student_sales_bindings (
     student_user_id BIGINT UNSIGNED PRIMARY KEY,
     sales_agent_user_id BIGINT UNSIGNED NOT NULL,
     assigned_by_user_id BIGINT UNSIGNED NULL,
     created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     INDEX idx_student_sales_agent (sales_agent_user_id)
   )'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = @db AND table_name = 'sales_commission_rules'
  ),
  'SELECT 1',
  'CREATE TABLE sales_commission_rules (
     id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
     organization_id BIGINT UNSIGNED NULL,
     level_no TINYINT UNSIGNED NOT NULL,
     tier_no TINYINT UNSIGNED NOT NULL,
     min_sales_cents BIGINT UNSIGNED NOT NULL DEFAULT 0,
     max_sales_cents BIGINT UNSIGNED NULL,
     rate_bps INT UNSIGNED NOT NULL DEFAULT 0,
     created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     UNIQUE KEY uk_sales_commission_rule (organization_id, level_no, tier_no),
     INDEX idx_sales_commission_lookup (organization_id, level_no, min_sales_cents)
   )'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = @db AND table_name = 'sales_orders'
  ),
  'SELECT 1',
  'CREATE TABLE sales_orders (
     id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
     order_no VARCHAR(48) NOT NULL UNIQUE,
     course_id BIGINT UNSIGNED NOT NULL,
     organization_id BIGINT UNSIGNED NULL,
     district_id BIGINT UNSIGNED NULL,
     buyer_user_id BIGINT UNSIGNED NOT NULL,
     student_user_id BIGINT UNSIGNED NOT NULL,
     sales_agent_user_id BIGINT UNSIGNED NULL,
     amount_cents INT UNSIGNED NOT NULL DEFAULT 0,
     status VARCHAR(20) NOT NULL DEFAULT ''pending'',
     payment_channel VARCHAR(40) NOT NULL DEFAULT ''wechat'',
     source VARCHAR(40) NOT NULL DEFAULT ''purchase'',
     wechat_transaction_id VARCHAR(80) NULL,
     detail JSON NULL,
     notify_payload JSON NULL,
     created_by_user_id BIGINT UNSIGNED NULL,
     created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     paid_at DATETIME NULL,
     INDEX idx_sales_order_scope (organization_id, district_id, status),
     INDEX idx_sales_order_buyer (buyer_user_id),
     INDEX idx_sales_order_student (student_user_id),
     INDEX idx_sales_order_agent_paid (sales_agent_user_id, paid_at)
   )'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = @db AND table_name = 'sales_order_commissions'
  ),
  'SELECT 1',
  'CREATE TABLE sales_order_commissions (
     id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
     order_id BIGINT UNSIGNED NOT NULL,
     beneficiary_user_id BIGINT UNSIGNED NOT NULL,
     level_no TINYINT UNSIGNED NOT NULL,
     tier_no TINYINT UNSIGNED NOT NULL,
     rate_bps INT UNSIGNED NOT NULL DEFAULT 0,
     team_sales_cents BIGINT UNSIGNED NOT NULL DEFAULT 0,
     commission_cents INT UNSIGNED NOT NULL DEFAULT 0,
     detail JSON NULL,
     created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     UNIQUE KEY uk_sales_order_level_beneficiary (order_id, beneficiary_user_id, level_no),
     INDEX idx_sales_commission_beneficiary (beneficiary_user_id, created_at)
   )'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT INTO sales_commission_rules (organization_id, level_no, tier_no, min_sales_cents, max_sales_cents, rate_bps)
SELECT NULL, t.level_no, t.tier_no, t.min_sales_cents, t.max_sales_cents, t.rate_bps
FROM (
  SELECT 1 AS level_no, 1 AS tier_no,       0 AS min_sales_cents,  9999999 AS max_sales_cents,  300 AS rate_bps
  UNION ALL SELECT 1, 2, 10000000, 29999999,  500
  UNION ALL SELECT 1, 3, 30000000, NULL,      800
  UNION ALL SELECT 2, 1,       0,  9999999,  150
  UNION ALL SELECT 2, 2, 10000000, 29999999,  300
  UNION ALL SELECT 2, 3, 30000000, NULL,      500
  UNION ALL SELECT 3, 1,       0,  9999999,  100
  UNION ALL SELECT 3, 2, 10000000, 29999999,  200
  UNION ALL SELECT 3, 3, 30000000, NULL,      300
) AS t
WHERE NOT EXISTS (
  SELECT 1 FROM sales_commission_rules r WHERE r.organization_id IS NULL
);

SET @db = DATABASE();

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = @db AND table_name = 'users' AND index_name = 'uk_users_full_name'
  ) OR EXISTS(
    SELECT 1 FROM (
      SELECT full_name FROM users GROUP BY full_name HAVING COUNT(*) > 1
    ) AS dup
  ),
  'SELECT 1',
  'ALTER TABLE users ADD UNIQUE KEY uk_users_full_name (full_name)'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = @db AND table_name = 'users' AND column_name = 'organization_id'
  ),
  'SELECT 1',
  'ALTER TABLE users ADD COLUMN organization_id BIGINT UNSIGNED NULL'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = @db AND table_name = 'users' AND column_name = 'district_id'
  ),
  'SELECT 1',
  'ALTER TABLE users ADD COLUMN district_id BIGINT UNSIGNED NULL'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = @db AND table_name = 'users' AND column_name = 'status'
  ),
  'SELECT 1',
  'ALTER TABLE users ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT ''active'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = @db AND table_name = 'districts' AND column_name = 'organization_id'
  ),
  'SELECT 1',
  'ALTER TABLE districts ADD COLUMN organization_id BIGINT UNSIGNED NULL'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = @db AND table_name = 'courses' AND column_name = 'organization_id'
  ),
  'SELECT 1',
  'ALTER TABLE courses ADD COLUMN organization_id BIGINT UNSIGNED NULL'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = @db AND table_name = 'courses' AND column_name = 'classroom_id'
  ),
  'SELECT 1',
  'ALTER TABLE courses ADD COLUMN classroom_id BIGINT UNSIGNED NULL'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = @db AND table_name = 'courses' AND column_name = 'district_id'
  ),
  'SELECT 1',
  'ALTER TABLE courses ADD COLUMN district_id BIGINT UNSIGNED NULL'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = @db AND table_name = 'courses' AND column_name = 'teacher_user_id'
  ),
  'SELECT 1',
  'ALTER TABLE courses ADD COLUMN teacher_user_id BIGINT UNSIGNED NULL'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = @db AND table_name = 'courses' AND column_name = 'assistant_name'
  ),
  'SELECT 1',
  'ALTER TABLE courses ADD COLUMN assistant_name VARCHAR(120) NULL'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = @db AND table_name = 'courses' AND column_name = 'assistant_user_id'
  ),
  'SELECT 1',
  'ALTER TABLE courses ADD COLUMN assistant_user_id BIGINT UNSIGNED NULL'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = @db AND table_name = 'courses' AND column_name = 'created_by_user_id'
  ),
  'SELECT 1',
  'ALTER TABLE courses ADD COLUMN created_by_user_id BIGINT UNSIGNED NULL'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = @db AND table_name = 'courses' AND column_name = 'price_cents'
  ),
  'SELECT 1',
  'ALTER TABLE courses ADD COLUMN price_cents INT UNSIGNED NOT NULL DEFAULT 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
