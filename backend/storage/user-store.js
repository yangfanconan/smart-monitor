import crypto from 'node:crypto'
import { storage } from './db.js'

// Initialize user/role tables
storage.db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    avatar TEXT DEFAULT '',
    status TEXT DEFAULT '1',
    user_gender TEXT DEFAULT '',
    nick_name TEXT DEFAULT '',
    user_phone TEXT DEFAULT '',
    user_email TEXT DEFAULT '',
    user_roles TEXT DEFAULT '["R_USER"]',
    created_by TEXT DEFAULT 'system',
    created_time TEXT DEFAULT (datetime('now','localtime')),
    updated_by TEXT DEFAULT '',
    updated_time TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS roles (
    role_id INTEGER PRIMARY KEY AUTOINCREMENT,
    role_name TEXT NOT NULL,
    role_code TEXT UNIQUE NOT NULL,
    description TEXT DEFAULT '',
    enabled INTEGER DEFAULT 1,
    create_time TEXT DEFAULT (datetime('now','localtime'))
  );
`)

// Seed default admin user if not exists
const adminExists = storage.db.prepare('SELECT id FROM users WHERE username = ?').get('admin')
if (!adminExists) {
  const hash = crypto.createHash('sha256').update('123456').digest('hex')
  storage.db.prepare(`INSERT INTO users (username, password_hash, nick_name, user_email, user_roles) VALUES (?, ?, ?, ?, ?)`)
    .run('admin', hash, '管理员', 'admin@router.local', '["R_SUPER","R_ADMIN","R_USER"]')
}

// Seed default roles if not exists
const roleExists = storage.db.prepare('SELECT role_id FROM roles WHERE role_code = ?').get('R_SUPER')
if (!roleExists) {
  const insertRole = storage.db.prepare('INSERT INTO roles (role_name, role_code, description) VALUES (?, ?, ?)')
  insertRole.run('超级管理员', 'R_SUPER', '拥有所有权限')
  insertRole.run('管理员', 'R_ADMIN', '拥有管理权限')
  insertRole.run('普通用户', 'R_USER', '普通访问权限')
}

function hashPwd(pwd) { return crypto.createHash('sha256').update(pwd).digest('hex') }

export const userStore = {
  // === User CRUD ===
  getUserList(params = {}) {
    const { current = 1, size = 10, username, status } = params
    let where = '1=1'
    const args = []
    if (username) { where += ' AND username LIKE ?'; args.push(`%${username}%`) }
    if (status) { where += ' AND status = ?'; args.push(status) }

    const total = storage.db.prepare(`SELECT COUNT(*) as c FROM users WHERE ${where}`).get(...args).c
    const records = storage.db.prepare(`SELECT * FROM users WHERE ${where} ORDER BY id LIMIT ? OFFSET ?`)
      .all(...args, Number(size), (Number(current) - 1) * Number(size))
      .map(u => ({
        id: u.id, avatar: u.avatar, status: u.status, userName: u.username,
        userGender: u.user_gender, nickName: u.nick_name, userPhone: u.user_phone,
        userEmail: u.user_email, userRoles: JSON.parse(u.user_roles || '[]'),
        createBy: u.created_by, createTime: u.created_time,
        updateBy: u.updated_by, updateTime: u.updated_time
      }))

    return { records, current: Number(current), size: Number(size), total }
  },

  createUser(data) {
    const { username, password, nickName, userEmail, userPhone, userRoles, userGender } = data
    if (!username || !password) throw new Error('用户名和密码不能为空')
    const exists = storage.db.prepare('SELECT id FROM users WHERE username = ?').get(username)
    if (exists) throw new Error('用户名已存在')
    const hash = hashPwd(password)
    const result = storage.db.prepare(`INSERT INTO users (username, password_hash, nick_name, user_email, user_phone, user_roles, user_gender) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(username, hash, nickName || '', userEmail || '', userPhone || '', JSON.stringify(userRoles || ['R_USER']), userGender || '')
    return { id: result.lastInsertRowid }
  },

  updateUser(id, data) {
    const { nickName, userEmail, userPhone, userRoles, userGender, status } = data
    storage.db.prepare(`UPDATE users SET nick_name=?, user_email=?, user_phone=?, user_roles=?, user_gender=?, status=?, updated_time=datetime('now','localtime') WHERE id=?`)
      .run(nickName || '', userEmail || '', userPhone || '', JSON.stringify(userRoles || []), userGender || '', status || '1', id)
    return { id }
  },

  deleteUser(id) {
    if (Number(id) === 1) throw new Error('不能删除默认管理员')
    storage.db.prepare('DELETE FROM users WHERE id = ?').run(id)
  },

  changePassword(userId, oldPassword, newPassword) {
    const user = storage.db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
    if (!user) throw new Error('用户不存在')
    if (user.password_hash !== hashPwd(oldPassword)) throw new Error('原密码错误')
    storage.db.prepare('UPDATE users SET password_hash = ?, updated_time = datetime(\'now\',\'localtime\') WHERE id = ?')
      .run(hashPwd(newPassword), userId)
  },

  resetPassword(userId, newPassword = '123456') {
    storage.db.prepare('UPDATE users SET password_hash = ?, updated_time = datetime(\'now\',\'localtime\') WHERE id = ?')
      .run(hashPwd(newPassword), userId)
  },

  // === Role CRUD ===
  getRoleList(params = {}) {
    const { current = 1, size = 10, roleName } = params
    let where = '1=1'
    const args = []
    if (roleName) { where += ' AND role_name LIKE ?'; args.push(`%${roleName}%`) }

    const total = storage.db.prepare(`SELECT COUNT(*) as c FROM roles WHERE ${where}`).get(...args).c
    const records = storage.db.prepare(`SELECT * FROM roles WHERE ${where} ORDER BY role_id LIMIT ? OFFSET ?`)
      .all(...args, Number(size), (Number(current) - 1) * Number(size))
      .map(r => ({
        roleId: r.role_id, roleName: r.role_name, roleCode: r.role_code,
        description: r.description, enabled: r.enabled === 1, createTime: r.create_time
      }))

    return { records, current: Number(current), size: Number(size), total }
  },

  createRole(data) {
    const { roleName, roleCode, description } = data
    if (!roleName || !roleCode) throw new Error('角色名称和编码不能为空')
    const result = storage.db.prepare('INSERT INTO roles (role_name, role_code, description) VALUES (?, ?, ?)')
      .run(roleName, roleCode, description || '')
    return { roleId: result.lastInsertRowid }
  },

  updateRole(roleId, data) {
    const { roleName, description, enabled } = data
    storage.db.prepare('UPDATE roles SET role_name=?, description=?, enabled=? WHERE role_id=?')
      .run(roleName, description || '', enabled ? 1 : 0, roleId)
    return { roleId }
  },

  deleteRole(roleId) {
    const role = storage.db.prepare('SELECT role_code FROM roles WHERE role_id = ?').get(roleId)
    if (role && ['R_SUPER', 'R_ADMIN', 'R_USER'].includes(role.role_code)) throw new Error('不能删除默认角色')
    storage.db.prepare('DELETE FROM roles WHERE role_id = ?').run(roleId)
  },

  // === Auth ===
  authenticate(username, password) {
    const user = storage.db.prepare('SELECT * FROM users WHERE username = ? AND status = ?').get(username, '1')
    if (!user || user.password_hash !== hashPwd(password)) return null
    return {
      id: user.id, username: user.username, roles: JSON.parse(user.user_roles || '[]'),
      email: user.user_email, nickName: user.nick_name
    }
  }
}
