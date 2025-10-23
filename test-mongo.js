require('dotenv').config();
const { MongoClient } = require('mongodb');

async function testConnection() {
  const uri = process.env.MONGODB_URI;
  
  if (!uri) {
    console.error('❌ MONGODB_URI not found in .env file');
    return;
  }
  
  console.log('🔄 Connecting to MongoDB...');
  
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('✅ Successfully connected to MongoDB!');
    
    // List databases to confirm connection works
    const databases = await client.db().admin().listDatabases();
    console.log('\n📚 Available databases:');
    databases.databases.forEach(db => console.log(`  - ${db.name}`));
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
  } finally {
    await client.close();
    console.log('\n🔌 Connection closed');
  }
}

testConnection();

