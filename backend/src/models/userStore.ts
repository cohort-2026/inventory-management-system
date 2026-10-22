
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';

export type Role = 'manager' | 'inventory_staff' | 'viewer';

export type User = {
  username: string;
  passwordHash: string;
  role: Role;
};

const DATA_FILE = path.join(__dirname, '../data/users.json');

// If the file doesn't exist yet (first run, or after a fresh clone),
// create it with the same seeded admin account we used to hardcode.
function ensureFileExists(): void {
  if (fs.existsSync(DATA_FILE)) return;

  const seedUsers: User[] = [
    { username: 'admin', passwordHash: bcrypt.hashSync('admin123', 12), role: 'manager' },
  ];

  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(seedUsers, null, 2));
}

function readUsers(): User[] {
  ensureFileExists();
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  return JSON.parse(raw);
}

function writeUsers(users: User[]): void {
  fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
}

export function findUser(username: string): User | undefined {
  const normalizedUsername = username.trim().toLowerCase();
  return readUsers().find((u) => u.username.trim().toLowerCase() === normalizedUsername);
}

export function addUser(user: User): void {
  const users = readUsers();
  users.push(user);
  writeUsers(users);
}