import { db } from "./firebase.js";
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  deleteDoc,
  updateDoc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const addForm = document.getElementById("addForm");
const tableBody = document.querySelector("#productTable tbody");
const searchInput = document.getElementById("searchInput");

// Modal elements
const modal = document.getElementById("modal");
const modalForm = document.getElementById("modalForm");
const modalProductId = document.getElementById("modalProductId");
const modalName = document.getElementById("modalName");
const modalCategory = document.getElementById("modalCategory");
const modalQuantity = document.getElementById("modalQuantity");
const modalPrice = document.getElementById("modalPrice");
const modalCancel = document.getElementById("modalCancel");

let allProducts = [];
let editingId = null;

// 🔹 Add Product
addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("productId").value.trim();
  const name = document.getElementById("name").value.trim();
  const category = document.getElementById("category").value.trim();
  const quantity = parseInt(document.getElementById("quantity").value);
  const price = parseFloat(document.getElementById("price").value);

  if (!id) return alert("Enter a Product ID");
  try {
    await setDoc(doc(db, "products", id), { id, name, category, quantity, price });
    addForm.reset();
  } catch (err) { console.error(err); }
});

// 🔹 Real-time display
onSnapshot(collection(db, "products"), (snapshot) => {
  const updatedProducts = [];
  snapshot.forEach((docSnap) => updatedProducts.push(docSnap.data()));
  allProducts = updatedProducts;
  displayProducts(allProducts);
});

function displayProducts(products) {
  tableBody.innerHTML = "";
  products.forEach(p => {
    tableBody.innerHTML += `
      <tr>
        <td>${p.id}</td>
        <td>${p.name}</td>
        <td>${p.category}</td>
        <td>${p.quantity}</td>
        <td>${p.price}</td>
        <td>
          <button onclick="openEditModal('${p.id}')">Edit</button>
          <button onclick="openDeleteModal('${p.id}')">Delete</button>
        </td>
      </tr>
    `;
  });
}

// 🔹 Open Edit Modal
window.openEditModal = async (id) => {
  editingId = id;
  const docSnap = await getDoc(doc(db, "products", id));
  if (!docSnap.exists()) return alert("Product not found");
  const p = docSnap.data();
  modalProductId.value = p.id;
  modalName.value = p.name;
  modalCategory.value = p.category;
  modalQuantity.value = p.quantity;
  modalPrice.value = p.price;
  modal.style.display = "flex";
};

// 🔹 Save from Modal
modalForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const newId = modalProductId.value.trim();
  const name = modalName.value.trim();
  const category = modalCategory.value.trim();
  const quantity = parseInt(modalQuantity.value);
  const price = parseFloat(modalPrice.value);

  if (newId !== editingId) {
    await setDoc(doc(db, "products", newId), { id: newId, name, category, quantity, price });
    await deleteDoc(doc(db, "products", editingId));
  } else {
    await updateDoc(doc(db, "products", editingId), { id: newId, name, category, quantity, price });
  }
  modal.style.display = "none";
  editingId = null;
});

// 🔹 Cancel modal
modalCancel.addEventListener("click", () => {
  modal.style.display = "none";
  editingId = null;
});

// 🔹 Delete Product Modal
window.openDeleteModal = (id) => {
  if (confirm("Are you sure you want to delete this product?")) {
    deleteDoc(doc(db, "products", id));
  }
};

// 🔹 Search Products
searchInput.addEventListener("input", (e) => {
  const query = e.target.value.toLowerCase();
  const filtered = allProducts.filter(p =>
    p.id.toLowerCase().includes(query) ||
    p.name.toLowerCase().includes(query) ||
    p.category.toLowerCase().includes(query)
  );
  displayProducts(filtered);
});
