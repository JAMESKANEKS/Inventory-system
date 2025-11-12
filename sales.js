import { db } from "./firebase.js";
import {
  collection,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  onSnapshot,
  Timestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const productInput = document.getElementById("productInput");
const saleForm = document.getElementById("saleForm");
const saleQuantity = document.getElementById("saleQuantity");
const salesTableBody = document.querySelector("#salesTable tbody");
const backBtn = document.getElementById("backBtn");
const autocompleteList = document.getElementById("autocompleteList");
const totalSalesSpan = document.getElementById("totalSales");
const perProductTotalsDiv = document.getElementById("perProductTotals");
const salesChartCanvas = document.getElementById("salesChart");

let products = [];
let salesChart; // Chart.js instance

// 🔹 Load products for autocomplete
onSnapshot(collection(db, "products"), snapshot => {
  products = [];
  snapshot.forEach(docSnap => products.push(docSnap.data()));
});

// 🔹 Autocomplete
productInput.addEventListener("input", () => {
  const val = productInput.value.toLowerCase();
  autocompleteList.innerHTML = "";

  if (!val) return;

  const matches = products.filter(p =>
    p.id.toLowerCase().includes(val) || p.name.toLowerCase().includes(val)
  );

  matches.forEach(p => {
    const item = document.createElement("div");
    item.classList.add("autocomplete-item");
    item.innerHTML = `<strong>${p.id}</strong> - ${p.name} (Stock: ${p.quantity})`;
    item.addEventListener("click", () => {
      productInput.value = p.id;
      autocompleteList.innerHTML = "";
    });
    autocompleteList.appendChild(item);
  });
});

document.addEventListener("click", e => {
  if (e.target !== productInput) autocompleteList.innerHTML = "";
});

// 🔹 Record Sale with confirmation
saleForm.addEventListener("submit", async e => {
  e.preventDefault();
  const productId = productInput.value.trim();
  const quantitySold = parseInt(saleQuantity.value);

  if (!productId) return alert("Please enter a Product ID");
  if (!quantitySold || quantitySold <= 0) return alert("Enter a valid quantity");

  const productRef = doc(db, "products", productId);
  const productSnap = await getDoc(productRef);

  if (!productSnap.exists()) return alert("Product not found!");
  const product = productSnap.data();

  if (quantitySold > product.quantity) return alert(`Not enough stock! Available: ${product.quantity}`);

  // 🔹 Confirmation Prompt
  const confirmSale = confirm(
    `Confirm Sale:\n\nProduct: ${product.name}\nID: ${product.id}\nQuantity: ${quantitySold}\nTotal: ${(
      quantitySold * product.price
    ).toFixed(2)}`
  );

  if (!confirmSale) return; // Exit if user cancels

  // Deduct stock
  await updateDoc(productRef, { quantity: product.quantity - quantitySold });

  // Save sale record
  await addDoc(collection(db, "sales"), {
    productId: product.id,
    name: product.name,
    quantitySold,
    price: product.price,
    date: Timestamp.now()
  });

  saleForm.reset();
  autocompleteList.innerHTML = "";
  alert("✅ Sale recorded successfully!");
});

// 🔹 Display Sales Records, Totals, and Chart
onSnapshot(collection(db, "sales"), snapshot => {
  salesTableBody.innerHTML = "";
  let totalSalesAmount = 0;
  const perProductTotals = {};

  snapshot.forEach(docSnap => {
    const s = docSnap.data();
    const date = s.date ? s.date.toDate().toLocaleString() : "-";
    const total = s.quantitySold * s.price;
    totalSalesAmount += total;

    if (!perProductTotals[s.name]) perProductTotals[s.name] = 0;
    perProductTotals[s.name] += total;

    salesTableBody.innerHTML += `
      <tr>
        <td>${s.productId}</td>
        <td>${s.name}</td>
        <td>${s.quantitySold}</td>
        <td>${s.price}</td>
        <td>${total}</td>
        <td>${date}</td>
      </tr>
    `;
  });

  totalSalesSpan.textContent = totalSalesAmount.toFixed(2);

  perProductTotalsDiv.innerHTML = "<h3>Sales per Product:</h3>";
  for (const [name, total] of Object.entries(perProductTotals)) {
    perProductTotalsDiv.innerHTML += `<p>${name}: ${total.toFixed(2)}</p>`;
  }

  // 🔹 Update Chart
  const labels = Object.keys(perProductTotals);
  const data = Object.values(perProductTotals);

  if (salesChart) salesChart.destroy();

  salesChart = new Chart(salesChartCanvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Total Sales Amount",
        data,
        backgroundColor: "rgba(54, 162, 235, 0.7)"
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
});

// 🔹 Back button
backBtn.addEventListener("click", () => {
  window.location.href = "index.html";
});
