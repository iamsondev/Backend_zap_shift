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
let trackingCollection;
// Start server only after DB connection
async function startServer() {
  try {
    await client.connect();

    // Collections
    usersCollection = client.db("usersdatabase").collection("users");
    trackingCollection = client.db("parcelDB").collection("tracking");
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
        // verify firebase token
 const verifyFBToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: "Unauthorized access" });
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized access" });
  }

  try {
    // ✅ Verify Firebase token
    const decoded = await admin.auth().verifyIdToken(token);

    // ✅ Fetch user role from DB
    const userInDB = await usersCollection.findOne({ email: decoded.email });
    decoded.role = userInDB?.role || "user"; // default fallback to user

    req.decoded = decoded;
    next();
  } catch (error) {
    console.error("❌ Token verification error:", error);
    return res.status(403).json({ message: "Forbidden access" });
  }
 };

    // verify admin token
  const verifyAdmin = async(req, res, next) => {
    const email = req.decoded.email;
    const query = {email};
    const user = await usersCollection.findOne(query);
    if(!user || user.role !== "admin"){
      return res.status(403).send({message:"forbidden access"})
    }
    next();
  }   

  // verify ride token
  const verifyRider = async(req, res, next) => {
    const email = req.decoded.email;
    const query = {email};
    const user = await usersCollection.findOne(query);
    if(!user || user.role !== "rider"){
      return res.status(403).send({message:"forbidden access"})
    }
    next();
  }   

 app.get("/", (req, res) => {
  res.send("🚀 ProFast Server is Running...");
 });

                                //Dashboard

    // ✅ Admin Dashboard API
 app.get("/admin/dashboard", verifyFBToken, verifyAdmin, async (req, res) => {
  try {
    const totalUsers = await usersCollection.countDocuments();
    const totalParcels = await parcelCollection.countDocuments();
    const totalRiders = await usersCollection.countDocuments({ role: "rider" });

    // Parcel status counts
    const assignedCount = await parcelCollection.countDocuments({ status: "assigned" });
    const inTransitCount = await parcelCollection.countDocuments({ status: "in-transit" });
    const deliveredCount = await parcelCollection.countDocuments({ status: "delivered" });
    const notCollectedCount = await parcelCollection.countDocuments({ delivery_status: "not_collected" });

    res.json({
      totalUsers,
      totalParcels,
      totalRiders,
      parcelStatus: {
        assigned: assignedCount,
        inTransit: inTransitCount,
        delivered: deliveredCount,
        notCollected: notCollectedCount,
      },
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({ message: "Failed to fetch dashboard data" });
  }
});
                            
                               // FOR USERS

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

//  /users/:id/role
 app.patch("/users/:id/role", verifyFBToken, verifyAdmin, async (req, res) => {
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

                              // FOR PARCELS
                              
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

 // POST new parcel
 app.post("/parcels", async (req, res) => {
  const parcelData = req.body;

  // Generate a tracking_id if not already provided
  if (!parcelData.tracking_id) {
    parcelData.tracking_id = `TRACK-${Date.now()}`; // simple unique ID
  }

  parcelData.status = "submitted"; // initial status
  parcelData.createdAt = new Date();

  try {
    // Insert the parcel
    const result = await parcelCollection.insertOne(parcelData);

    // Insert initial tracking record
    const trackingDoc = {
      tracking_id: parcelData.tracking_id,
      status: "submitted",
      message: "Parcel created",
      updatedBy: {
        role: "user",
        email: parcelData.created_by_email || "unknown",
      },
      timestamp: new Date(),
    };
    await trackingCollection.insertOne(trackingDoc);

    res.status(201).json({ 
      success: true, 
      message: "Parcel created successfully", 
      id: result.insertedId,
      tracking_id: parcelData.tracking_id
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to create parcel" });
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

// ✅ Get all parcels assigned to a rider that are still pending (assigned or in-transit)
app.get("/riders/parcels", verifyFBToken,verifyRider, async (req, res) => {
  try {
    const riderEmail = req.decoded?.email; // ✅ Get rider email from Firebase token
    console.log("👤 Rider Email from Token:", riderEmail);

    if (!riderEmail) {
      return res.status(400).json({ success: false, message: "Rider email missing" });
    }

    // ✅ Build query for parcels assigned to this rider
    const query = {
      "assignedRider.riderEmail": riderEmail,
      status: { $in: ["assigned", "in-transit"] }, // Only pending tasks
    };

    console.log("📢 [GET RIDER PARCELS] Query:", JSON.stringify(query));

    // ✅ Fetch parcels from DB
    const parcels = await parcelCollection
      .find(query)
      .sort({ creation_date: -1 })
      .toArray();

    console.log(`📦 Found ${parcels.length} pending parcels for rider ${riderEmail}`);

    return res.json({ success: true, count: parcels.length, parcels });
  } catch (err) {
    console.error("❌ [GET RIDER PARCELS ERROR]:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch rider parcels",
      error: err.message,
    });
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
                        //  parcel tracking

// Get tracking history by parcel ID
// 📦 GET tracking history
app.get("/tracking/:trackingId", async (req, res) => {
  try {
    const trackingId = req.params.trackingId;

    const history = await trackingCollection
      .find({ tracking_id: trackingId })
      .sort({ timestamp: 1 })
      .toArray();

    res.json({ success: true, count: history.length, history });
  } catch (err) {
    console.error("❌ [GET TRACKING ERROR]:", err);
    res.status(500).json({ success: false, message: "Failed to fetch tracking history" });
  }
});

// 📦 POST tracking update
app.post("/tracking/:trackingId", verifyFBToken, async (req, res) => {
  try {
    console.log("🔐 [TRACKING API] Decoded token:", req.decoded); // <-- Debug: See who is calling

    // ✅ Only allow ADMIN to update tracking
    if (req.decoded.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only admins are allowed to update tracking events",
      });
    }

    const trackingId = req.params.trackingId;
    const { status, message, location, details } = req.body;

    // Validate status
    if (!["submitted", "paid", "assigned", "picked-up", "delivered"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    // Check parcel existence
    const parcel = await parcelCollection.findOne({ tracking_id: trackingId });
    if (!parcel) {
      return res.status(404).json({
        success: false,
        message: "Parcel not found",
      });
    }

    // Insert tracking record
    const trackingDoc = {
      tracking_id: trackingId,
      status,
      message: message || "",
      location: location || null,
      details: details || null,
      updatedBy: {
        role: req.decoded.role, // will always be "admin" after check above
        email: req.decoded.email,
      },
      timestamp: new Date(),
    };

    await trackingCollection.insertOne(trackingDoc);

    // Update main parcel's status
    await parcelCollection.updateOne(
      { tracking_id: trackingId },
      { $set: { status, updatedAt: new Date() } }
    );

    // Fetch full history
    const history = await trackingCollection
      .find({ tracking_id: trackingId })
      .sort({ timestamp: 1 })
      .toArray();

    res.json({
      success: true,
      message: "Tracking updated successfully",
      history,
    });
  } catch (err) {
    console.error("❌ [ADD TRACKING ERROR]:", err);
    res.status(500).json({
      success: false,
      message: "Failed to add tracking event",
    });
  }
});


                                 //FOR RIDERS

// GET all pending riders
app.get("/riders/pending",verifyFBToken,verifyAdmin, async (req, res) => {
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

// Assign rider to parcel
app.patch("/parcels/:id/assign-rider", verifyFBToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { riderId, riderName, riderEmail } = req.body;

    console.log("📢 [ASSIGN RIDER API HIT]");
    console.log("🆔 Parcel ID:", id);
    console.log("📦 Request Body:", { riderId, riderName, riderEmail });

    if (!ObjectId.isValid(id)) {
      console.log("❌ Invalid ObjectId");
      return res.status(400).json({ success: false, message: "Invalid parcel ID" });
    }

    const query = { _id: new ObjectId(id) };

    const update = {
      $set: {
        assignedRider: {
          riderId,
          riderName,
          riderEmail: riderEmail || "N/A",
        },
        status: "assigned",
        updatedAt: new Date(),
      },
    };

    console.log("🛠 MongoDB Update Query:", JSON.stringify(query));
    console.log("🛠 MongoDB Update Data:", JSON.stringify(update));

    const result = await parcelCollection.updateOne(query, update);

    console.log("✅ MongoDB Update Result:", result);

    if (result.matchedCount === 0) {
      console.log("❌ No parcel found for this ID");
      return res.status(404).json({ success: false, message: "Parcel not found" });
    }

    res.json({ success: true, message: "Rider assigned successfully!" });
  } catch (err) {
    console.error("❌ [ASSIGN RIDER ERROR]:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
});

// ✅ Update parcel status (Rider action)
// PATCH /riders/parcels/:id/status
app.patch("/riders/parcels/:id/status", verifyFBToken, verifyRider, async (req, res) => {
  try {
    const { id } = req.params;
    const { newStatus } = req.body;
    
    const parcel = await parcelCollection.findOne({ _id: new ObjectId(id) });
    if (!parcel) return res.status(404).send({ message: "Parcel not found" });

    // Update parcel status
    const updateData = { status: newStatus, updatedAt: new Date() };
    await parcelCollection.updateOne({ _id: new ObjectId(id) }, { $set: updateData });

    // Log tracking event
    const trackingData = {
      tracking_id: parcel.tracking_id,
      status: newStatus,
      timestamp: new Date(),
      message: "",
      location: null,
      details: {},
      updatedBy: { email: req.decoded.email, role: req.decoded.role },
    };

    if (newStatus === "in-transit") {
      trackingData.message = `Picked up by ${req.decoded.name || req.decoded.email}`;
      trackingData.details.picked_up_by = req.decoded.name || req.decoded.email;
    } else if (newStatus === "delivered") {
      trackingData.message = `Delivered by ${req.decoded.name || req.decoded.email}`;
      trackingData.details.delivered_by = req.decoded.name || req.decoded.email;
    }

    await trackingCollection.insertOne(trackingData);

    res.send({ success: true, parcel: { ...parcel, ...updateData }, tracking: trackingData });
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Server error" });
  }
});

// GET completed parcels
app.get("/riders/completed-parcels", verifyFBToken, verifyRider, async (req, res) => {
  try {
    const riderEmail = req.decoded?.email;
    if (!riderEmail) {
      return res.status(400).json({ success: false, message: "Rider email missing" });
    }

    const query = {
      "assignedRider.riderEmail": riderEmail,
      status: "delivered",
    };

    const parcels = await parcelCollection.find(query).sort({ updatedAt: -1 }).toArray();

    res.json({ success: true, count: parcels.length, parcels });
  } catch (err) {
    console.error("❌ [GET COMPLETED PARCELS ERROR]:", err);
    res.status(500).json({ success: false, message: "Failed to fetch completed parcels" });
  }
});


// PATCH cashout (single parcel)
app.patch("/riders/cashout/:id", verifyFBToken, verifyRider, async (req, res) => {
  try {
    const riderEmail = req.decoded?.email;
    const parcelId = req.params.id;

    if (!riderEmail) {
      return res.status(400).json({ success: false, message: "Rider email missing" });
    }

    const parcel = await parcelCollection.findOne({
      _id: new ObjectId(parcelId),
      "assignedRider.riderEmail": riderEmail,
      status: "delivered",
      cashedOut: { $ne: true },
    });

    if (!parcel) {
      return res.status(404).json({ success: false, message: "Parcel not found or already cashed out" });
    }

    const sameDistrict = parcel.sender_region === parcel.receiver_region;
    const earning = sameDistrict ? parcel.deliveryCost * 0.8 : parcel.deliveryCost * 0.3;

    await parcelCollection.updateOne(
      { _id: new ObjectId(parcelId) },
      { $set: { cashedOut: true, cashedOutAt: new Date() } }
    );

    res.json({
      success: true,
      message: "Parcel cashed out successfully",
      earning,
    });
  } catch (err) {
    console.error("❌ [CASHOUT ERROR]:", err);
    res.status(500).json({ success: false, message: "Failed to process cashout" });
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


app.get("/riders/active", verifyFBToken, async (req, res) => {
  const { district } = req.query; // client side থেকে পাঠাও
  try {
    let query = { status: "active" };
    if (district) {
      query.district = { $regex: district, $options: "i" };
    }

    const riders = await ridersCollection.find(query).toArray();
    res.json({ riders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

                        // FOR PAYMENTS
                        
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

    // ✅ Add tracking event for payment
    const trackingDoc = {
      tracking_id: parcel.tracking_id,
      status: "paid",
      message: "Payment completed successfully",
      updatedBy: { role: "system", email: "system@domain.com" },
      timestamp: new Date(),
    };
    await trackingCollection.insertOne(trackingDoc);

    res.status(200).json({ 
      success: true, 
      paymentInsert: { ...paymentDoc, _id: result.insertedId },
      trackingInsert: trackingDoc
    });
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



