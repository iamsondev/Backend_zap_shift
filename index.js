// index.js
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe");
const admin = require("firebase-admin");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const serviceAccount = require("./firebase_admin_key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


// MongoDB connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.r1yzage.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Collections
let usersCollection;
let parcelCollection;
let paymentCollection;

// Start server only after DB connection
async function startServer() {
  try {
    await client.connect();

    // Collections
    usersCollection = client.db("usersdatabase").collection("users");
    parcelCollection = client.db("parcelDB").collection("parcels");
    paymentCollection = client.db("paymentDB").collection("payments");

    console.log("✅ MongoDB connected");


    // Start server
    app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
  } catch (err) {
    console.error("Failed to start server:", err);
  }
}

startServer();

const verifyFBToken = async(req, res, next) => {
      const authHeader = req.headers.authorization;
      if(!authHeader){
        return res.status(401).send({message:'unAuthorized access'})
      }
      const token = authHeader.split('')[1];
      if(!token){
        return res.status(401).send({message:'unAuthorized access'})
      }
      next();
    } 

 app.get("/", (req, res) => {
  res.send("🚀 ProFast Server is Running...");
 });

// for users
  app.post('/users', async (req, res) => {
  const { email, name } = req.body;
  const userExists = await usersCollection.findOne({ email });
  if (userExists) {
    return res.status(200).send({ message: 'User already exists', inserted: false });
  }

  const user = {
    name,
    email,
    createdAt: new Date()
  };

  const result = await usersCollection.insertOne(user);
  res.send(result);
 });


// GET all parcels or by email
 app.get("/parcels", async (req, res) => {
  console.log('headers in payment', req.headers)
  const userEmail = req.query.email;
  try {
    const query = userEmail ? { created_by_email: userEmail } : {};
    const parcels = await parcelCollection.find(query).sort({ createdAt: -1 }).toArray();
    res.json({ success: true, parcels });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch parcels" });
  }
 });

// GET parcel by ID
 app.get("/parcels/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const query = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id };
    const parcel = await parcelCollection.findOne(query);
    if (!parcel) return res.status(404).json({ success: false, message: "Parcel not found" });
    res.json({ success: true, parcel });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch parcel" });
  }
 });

// POST new parcel
 app.post("/parcels", async (req, res) => {
  const parcelData = req.body;
  parcelData.status = "Pending";
  try {
    const result = await parcelCollection.insertOne(parcelData);
    res.status(201).json({ success: true, message: "Parcel created successfully", id: result.insertedId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to create parcel" });
  }
 });

// DELETE parcel
 app.delete("/parcels/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const query = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id };
    const result = await parcelCollection.deleteOne(query);
    if (result.deletedCount === 1) res.json({ success: true, message: "Parcel deleted successfully" });
    else res.status(404).json({ success: false, message: "Parcel not found" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to delete parcel" });
  }
 });

// POST create payment intent (Stripe)
app.post("/create-payment-intent", async (req, res) => {
  const { amountInCents } = req.body;
  try {
    const paymentIntent = await stripe(process.env.PAYMENT_GATEWAY_KEY).paymentIntents.create({
      amount: amountInCents,
      currency: "usd",
      payment_method_types: ["card"],
    });
    res.send({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

// POST record payment
app.post("/payments", async (req, res) => {
  try {
    const { parcelId, paymentMethod, userEmail, tranxId } = req.body;

    const query = ObjectId.isValid(parcelId) ? { _id: new ObjectId(parcelId) } : { _id: parcelId };
    const parcel = await parcelCollection.findOne(query);
    if (!parcel) return res.status(404).json({ message: "Parcel not found" });

    // Mark parcel as paid
    await parcelCollection.updateOne(query, { $set: { Payment_status: "paid" } });

    // Record payment
    const paymentDoc = {
      parcelId,
      userEmail,
      paymentMethod,
      amount: parcel.deliveryCost,
      status: "succeeded",
      tranxId,
      paymentDate: new Date(),
      tracking_id: parcel.tracking_id,
    };

    const result = await paymentCollection.insertOne(paymentDoc);
    res.status(200).json({ success: true, paymentInsert: { ...paymentDoc, _id: result.insertedId } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET all payments or by email / parcelId
app.get("/payments", verifyFBToken, async (req, res) => {
  const { email, parcelId } = req.query;
  try {
    const query = {};
    if (email) query.userEmail = email;
    if (parcelId) query.parcelId = parcelId;

    const payments = await paymentCollection.find(query).sort({ paymentDate: -1 }).toArray();
    res.status(200).json({ success: true, payments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch payments" });
  }
});


