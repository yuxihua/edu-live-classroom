CREATE DATABASE IF NOT EXISTS edu_live_classroom CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE edu_live_classroom;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(40) NOT NULL,
  organization_id BIGINT UNSIGNED NULL,
  district_id BIGINT UNSIGNED NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
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

SET @db = DATABASE();

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
