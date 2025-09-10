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
    ridersCollection = client.db("ridersDB").collection("riders");

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
      const token = authHeader.split(' ')[1];
      if(!token){
        return res.status(401).send({message:'unAuthorized access'})
      }
      // verify the token
      try{
        const decoded = await admin.auth().verifyIdToken(token);
        req.decoded = decoded;
        next();
      }
      catch(error){
        console.error('Token verification error:', error);
         return res.status(403).send({message:'forbidden access'})
      }
      
    } 

 app.get("/", (req, res) => {
  res.send("🚀 ProFast Server is Running...");
 });

// for users
// GET /users/search?email=...
app.get("/users/search", async (req, res) => {
  const { email } = req.query;
  if (!email) return res.json({ users: [] });

  const users = await usersCollection
    .find({ email: { $regex: email, $options: "i" } }) // <-- partial match
    .limit(10)
    .toArray();

  res.json({ users });
});

// PUT /users/:id/role
app.put("/users/:id/role", async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  if (!role) {
    return res.status(400).json({ success: false, message: "Role is required" });
  }

  try {
    const query = { _id: new ObjectId(id) };
    const user = await usersCollection.findOne(query);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const updateResult = await usersCollection.updateOne(query, {
      $set: { role }
    });

    res.json({
      success: true,
      modifiedCount: updateResult.modifiedCount,
      user: { ...user, role }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET /users/role/:email
app.get("/users/role/:email", async (req, res) => {
  try {
    const { email } = req.params;

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    const user = await usersCollection.findOne({ email });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, email: user.email, role: user.role });
  } catch (err) {
    console.error("Error fetching role:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});




  // POST create new user
 app.post('/users', async (req, res) => {
  try {
    const { email, name } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    const userExists = await usersCollection.findOne({ email });
    if (userExists) {
      return res.status(200).json({ 
        success: true, 
        message: 'User already exists', 
        inserted: false, 
        user: userExists 
      });
    }

    const user = {
      name: name || null,
      email,
      role: "user",
      createdAt: new Date()
    };

    const result = await usersCollection.insertOne(user);
    res.status(201).json({ 
      success: true, 
      message: "User created successfully", 
      inserted: true, 
      user: { ...user, _id: result.insertedId } 
    });
  } catch (err) {
    console.error("Error creating user:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
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
// Riders
// GET all pending riders
app.get("/riders/pending", async (req, res) => {
  try {
    const pendingRiders = await ridersCollection
      .find({ status: "pending" })
      .sort({ createdAt: -1 }) // latest first
      .toArray();

    res.status(200).json({ success: true, riders: pendingRiders });
  } catch (err) {
    console.error("Failed to fetch pending riders:", err);
    res.status(500).json({ success: false, message: "Failed to fetch pending riders" });
  }
});


app.post('/riders', async(req, res)=> {
  try {
    const rider = req.body;
    const result = await ridersCollection.insertOne(rider); // ✅ await
    console.log("Rider added:", result); // ✅ log to terminal
    res.status(201).json({ insertedId: result.insertedId });
  } catch(err) {
    console.error(err);
    res.status(500).json({ message: "Failed to add rider" });
  }
});
// update rider

app.patch("/riders/:id", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const query = { _id: new ObjectId(id) };
    const rider = await ridersCollection.findOne(query);

    if (!rider) {
      return res.status(404).json({ message: "Rider not found" });
    }

    // Update rider status
    const updateRider = await ridersCollection.updateOne(query, {
      $set: { status, updatedAt: new Date() }
    });

    // Ensure the corresponding user exists
    if (rider.email) {
      const user = await usersCollection.findOne({ email: rider.email });
      if (user) {
        await usersCollection.updateOne(
          { email: rider.email },
          { $set: { role: status === "active" ? "rider" : user.role } }
        );
      } else {
        // If user does not exist, create with role = rider if approved
        await usersCollection.insertOne({
          name: rider.name || null,
          email: rider.email,
          role: status === "active" ? "rider" : "user",
          createdAt: new Date()
        });
      }
    }

    res.json({ modifiedCount: updateRider.modifiedCount });
  } catch (err) {
    console.error("Error updating rider:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE rider
app.delete("/riders/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const query = { _id: new ObjectId(id) };
    const result = await ridersCollection.deleteOne(query);

    res.status(200).json({ deletedCount: result.deletedCount });
  } catch (err) {
    console.error("Delete rider error:", err);
    res.status(500).json({ message: "Failed to delete rider" });
  }
});

app.get("/riders/active", async (req, res) => {
  const { search } = req.query;
  const query = { status: "active" };

  if (search) {
    query.name = { $regex: search, $options: "i" };
  }

  const riders = await ridersCollection.find(query).toArray();
  res.json({ riders });
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
    console.log('headers:', req.headers);
    console.log('query:', req.query);
    console.log('decoded from middleware:', req.decoded);

    const userEmail = email || req.decoded.email;

    if (req.decoded.email !== userEmail) {
      return res.status(403).send({ message: 'Forbidden access' });
    }

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



