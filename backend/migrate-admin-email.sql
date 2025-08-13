-- 更新管理员邮箱
UPDATE users 
SET email = 'admin@cialloo.site', updated_at = strftime('%s', 'now') * 1000
WHERE id = 'admin';

-- 验证更新
SELECT id, email, role FROM users WHERE id = 'admin';
