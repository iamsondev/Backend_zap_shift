
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const PORT = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
// Load environment variables
dotenv.config();

const app = express();


// Middleware
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.r1yzage.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    const parcelCollection = client.db("parcelDB").collection("parcels");
  // Root Route
 app.get("/", (req, res) => {
  res.send("🚀ProFast Server is Running...");
 });

    
// GET parcels (all or by user email)
app.get("/parcels", async (req, res) => {
  const userEmail = req.query.email; // optional

  try {
    const query = userEmail ? { created_by_email: userEmail } : {};
    const parcels = await parcelCollection
      .find(query)
      .sort({ createdAt: -1 }) // latest first
      .toArray();

    res.json({ success: true, parcels });
  } catch (err) {
    console.error("❌ Failed to fetch parcels:", err);
    res.status(500).json({ success: false, message: "Failed to fetch parcels" });
  }
});


  // ✅ POST API: Create a new parcel
app.post("/parcels", async (req, res) => {
  const parcelData = req.body;

  // Add server-side created fields (extra safety)
  // parcelData.createdAt = new Date();
  parcelData.status = "Pending";

  try {
    const result = await parcelCollection.insertOne(parcelData);
    res.status(201).json({
      success: true,
      message: "Parcel created successfully",
      id: result.insertedId,
    });
  } catch (err) {
    console.error("❌ Failed to insert parcel:", err);
    res.status(500).json({
      success: false,
      message: "Failed to create parcel",
    });
  }
});

 
app.delete("/parcels/:id", async (req, res) => {
  const { id } = req.params;

  try {
    let query;

    // ✅ If the id is a valid ObjectId, use it
    if (ObjectId.isValid(id)) {
      query = { _id: new ObjectId(id) };
    } else {
      // ✅ Otherwise, treat it as a plain string
      query = { _id: id };
    }

    const result = await parcelCollection.deleteOne(query);

    if (result.deletedCount === 1) {
      res.json({ success: true, message: "Parcel deleted successfully" });
    } else {
      res.status(404).json({ success: false, message: "Parcel not found" });
    }
  } catch (err) {
    console.error("❌ Failed to delete parcel:", err);
    res.status(500).json({ success: false, message: "Failed to delete parcel" });
  }
});



    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



// Start Server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
