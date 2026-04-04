require("dotenv").config();

const { doc, setDoc, serverTimestamp } = require("firebase/firestore");
const { db } = require("../src/config/firebase");

async function main() {
  const demoUserRef = doc(db, "users", "demo-user");
  const demoTestimonialRef = doc(db, "testimonials", "demo-testimonial");

  await setDoc(
    demoUserRef,
    {
      id: "demo-user",
      fullName: "Demo User",
      email: "demo@example.com",
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );

  await setDoc(
    demoTestimonialRef,
    {
      id: "demo-testimonial",
      userId: "demo-user",
      fullName: "Demo User",
      message: "Testimonial awal untuk inisialisasi collection.",
      rating: 5,
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );

  console.log("Firestore collections initialized: users, testimonials");
}

main().catch((error) => {
  console.error("Failed to initialize Firestore collections.");
  console.error(error);
  process.exit(1);
});
