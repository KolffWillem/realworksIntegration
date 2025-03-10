const crypto = require('crypto');

function decrypt(encrypted, secretKey) {
  // Encrypted data should be in format: iv:encryptedData
  const [ivHex, encryptedData] = encrypted.split(':');
  
  // Convert IV from hex to Buffer
  const iv = Buffer.from(ivHex, 'hex');
  
  // Create key buffer (must be 32 bytes for aes-256)
  const key = crypto.scryptSync(secretKey, 'salt', 32);
  
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

module.exports = decrypt;