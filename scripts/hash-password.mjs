/**
 * 生成写入 .env 的 ADMIN_PASSWORD_HASH。
 * 用法：npm run hash-password -- '你的密码'
 * 也可以不带参数，改为从标准输入读取（避免密码留在命令历史里）。
 */
import { createInterface } from "node:readline/promises";
import { hashPassword } from "../server/src/auth.js";

let password = process.argv.slice(2).join(" ").trim();

if (!password) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  password = (await rl.question("请输入管理员密码（输入内容会显示在终端）：")).trim();
  rl.close();
}

if (password.length < 8) {
  console.error("密码至少 8 位。");
  process.exit(1);
}

console.log("\n把下面这一行写入 .env（替换同名的空值）：\n");
console.log(`ADMIN_PASSWORD_HASH=${hashPassword(password)}\n`);
