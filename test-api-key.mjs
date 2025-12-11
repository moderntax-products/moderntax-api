import crypto from 'crypto'

// Your API key
const fullKey = 'sk_employercom_1765489462889_a9e96ca388c0948ee60ea55c020249527ca184affe8a9b15560461aa0be1a831'

// Extract parts
const keyParts = fullKey.split('_')
console.log('Full key:', fullKey)
console.log('Key parts:', keyParts)
console.log('Number of parts:', keyParts.length)

// Reconstruct
const keyId = `${keyParts[0]}_${keyParts[1]}_${keyParts[2]}`
const secretKey = keyParts.slice(3).join('_')
const hashedKey = crypto.createHash('sha256').update(secretKey).digest('hex')

console.log('\nExtracted:')
console.log('keyId:', keyId)
console.log('secretKey:', secretKey)
console.log('hashedKey:', hashedKey)
