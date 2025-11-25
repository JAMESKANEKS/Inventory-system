import { db, auth } from "./firebase.js";
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  deleteDoc,
  updateDoc,
  getDoc,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

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
const modalCancel = document.getElementById("modalCancel");

let allProducts = [];
let editingId = null;
let currentUser = null;
let currentRole = 'Viewer';
const minStockInput = document.getElementById('minStockThreshold');

// Function to add a log entry
async function addLogEntry(productId, productName, qty, type, remarks) {
  try {
    const userEmail = auth.currentUser?.email || 'system';
    const logData = {
      productId,
      productName,
      qty,
      type,
      remarks,
      userId: auth.currentUser?.uid || 'system',
      userEmail,
      timestamp: new Date()
    };
    
    await addDoc(collection(db, 'logs'), logData);
    console.log('Log entry added:', logData);
  } catch (error) {
    console.error('Error adding log entry:', error);
  }
}

// 🔹 Add Product
addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("productId").value.trim();
  const name = document.getElementById("name").value.trim();
  const category = document.getElementById("category").value.trim();
  const price = parseFloat(document.getElementById("price").value);
  const unit = document.getElementById("unit").value.trim();
  const quantity = parseInt(document.getElementById("quantity").value);

  if (!id) return alert("Enter a Product ID");
  try {
    // Add the product to Firestore
    await setDoc(doc(db, "products", id), { 
      id, 
      name, 
      category, 
      price, 
      unit, 
      quantity,
      createdAt: new Date().toISOString()
    });
    
    // Add a log entry for the new product
    await addLogEntry(
      id,
      name,
      quantity,
      'in',
      'New product added to inventory'
    );
    
    addForm.reset();
    alert("Product added successfully!");
  } catch (err) { 
    console.error(err);
    alert("Error adding product: " + err.message);
  }
});

// 🔹 Real-time display
onSnapshot(collection(db, "products"), (snapshot) => {
  const updatedProducts = [];
  snapshot.forEach((docSnap) => updatedProducts.push(docSnap.data()));
  allProducts = updatedProducts;
  displayProducts(allProducts);
  updateDashboardCards(allProducts);
  updateTotalSales();
});

function displayProducts(products) {
  tableBody.innerHTML = "";
  products.forEach(p => {
    tableBody.innerHTML += `
      <tr class="product-row" data-id="${p.id}">
        <td>${p.id}</td>
        <td>${p.name}</td>
        <td>${p.category}</td>
        <td>₱${(p.price || 0).toFixed(2)}</td>
        <td>${p.unit || ''}</td>
        <td>${p.quantity}</td>
      </tr>
    `;
  });
  
  // Initialize DataTables after updating the table
  if ($.fn.DataTable.isDataTable('#productsTable')) {
    $('#productsTable').DataTable().destroy();
  }
  
  $('#productsTable').DataTable({
    responsive: true,
    order: [[0, 'asc']],
    language: {
      search: "Search products:",
      paginate: {
        previous: '&laquo;',
        next: '&raquo;'
      }
    },
    dom: 'lrtip',
    pageLength: 10
  });
}

function updateDashboardCards(products) {
  const total = products.length;
  const threshold = parseInt(minStockInput?.value || 5, 10);
  const low = products.filter(p => (p.quantity || 0) <= (p.minStock || threshold)).length;
  document.getElementById('totalProducts').textContent = total;
  document.getElementById('lowStockCount').textContent = low;
}

// Calculate stock movement today
async function updateStockMovementToday() {
  try {
    const logsQuery = collection(db, 'logs');
    onSnapshot(logsQuery, (snap) => {
      let movementCount = 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      snap.forEach(doc => {
        const log = doc.data();
        if (log.timestamp) {
          const logDate = new Date(log.timestamp.seconds * 1000);
          logDate.setHours(0, 0, 0, 0);
          if (logDate.getTime() === today.getTime()) {
            movementCount++;
          }
        }
      });
      document.getElementById('stockMovementToday').textContent = movementCount;
    });
  } catch (err) {
    console.error('Error updating stock movement:', err);
  }
}

// Calculate total sales from logs
async function updateTotalSales() {
  try {
    const logsQuery = collection(db, 'logs');
    onSnapshot(logsQuery, (snap) => {
      let totalRevenue = 0;
      snap.forEach(doc => {
        const log = doc.data();
        // Only count sales where type is 'out' and remarks is 'sold'
        if (log.type === 'out' && log.remarks === 'sold') {
          // Find product price and multiply by quantity sold
          const product = allProducts.find(p => p.id === log.productId);
          if (product && product.price) {
            totalRevenue += (product.price * log.qty);
          }
        }
      });
      document.getElementById('totalSales').textContent = '₱' + totalRevenue.toFixed(2);
    });
  } catch (err) {
    console.error('Error calculating sales:', err);
  }
}

// Chart instances
let salesChartInstance = null;
let stockChartInstance = null;

// Update Sales Chart
async function updateSalesChart() {
  try {
    const logsQuery = collection(db, 'logs');
    onSnapshot(logsQuery, (snap) => {
      const salesByProduct = {};
      snap.forEach(doc => {
        const log = doc.data();
        if (log.type === 'out') {
          const product = allProducts.find(p => p.id === log.productId);
          if (product && product.price) {
            const productName = product.name;
            const sales = product.price * log.qty;
            salesByProduct[productName] = (salesByProduct[productName] || 0) + sales;
          }
        }
      });

      const labels = Object.keys(salesByProduct);
      const data = Object.values(salesByProduct);
      
      // Color palette for different products
      const colors = [
        'rgba(37, 99, 235, 0.7)',    // Blue
        'rgba(59, 130, 246, 0.7)',   // Sky Blue
        'rgba(99, 102, 241, 0.7)',   // Indigo
        'rgba(139, 92, 246, 0.7)',   // Purple
        'rgba(168, 85, 247, 0.7)',   // Violet
        'rgba(236, 72, 153, 0.7)',   // Pink
        'rgba(244, 63, 94, 0.7)',    // Rose
        'rgba(239, 68, 68, 0.7)',    // Red
        'rgba(249, 115, 22, 0.7)',   // Orange
        'rgba(251, 146, 60, 0.7)',   // Amber
        'rgba(34, 197, 94, 0.7)',    // Green
        'rgba(6, 182, 212, 0.7)'     // Cyan
      ];
      
      const borderColors = [
        'rgba(37, 99, 235, 1)',      // Blue
        'rgba(59, 130, 246, 1)',     // Sky Blue
        'rgba(99, 102, 241, 1)',     // Indigo
        'rgba(139, 92, 246, 1)',     // Purple
        'rgba(168, 85, 247, 1)',     // Violet
        'rgba(236, 72, 153, 1)',     // Pink
        'rgba(244, 63, 94, 1)',      // Rose
        'rgba(239, 68, 68, 1)',      // Red
        'rgba(249, 115, 22, 1)',     // Orange
        'rgba(251, 146, 60, 1)',     // Amber
        'rgba(34, 197, 94, 1)',      // Green
        'rgba(6, 182, 212, 1)'       // Cyan
      ];

      const backgroundColor = labels.map((_, i) => colors[i % colors.length]);
      const borderColor = labels.map((_, i) => borderColors[i % borderColors.length]);

      const ctx = document.getElementById('salesChart');
      if (!ctx) return;

      if (salesChartInstance) {
        salesChartInstance.data.labels = labels;
        salesChartInstance.data.datasets[0].data = data;
        salesChartInstance.data.datasets[0].backgroundColor = backgroundColor;
        salesChartInstance.data.datasets[0].borderColor = borderColor;
        salesChartInstance.update();
      } else {
        salesChartInstance = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [{
              label: 'Sales Revenue (₱)',
              data: data,
              backgroundColor: backgroundColor,
              borderColor: borderColor,
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
              legend: { display: true }
            },
            scales: {
              y: {
                beginAtZero: true,
                title: { display: true, text: 'Revenue (₱)' }
              }
            }
          }
        });
      }
    });
  } catch (err) {
    console.error('Error updating sales chart:', err);
  }
}

// Update Stock Chart
function updateStockChart() {
  const labels = allProducts.map(p => p.name);
  const data = allProducts.map(p => p.quantity);

  const ctx = document.getElementById('stockChart');
  if (!ctx) return;

  if (stockChartInstance) {
    stockChartInstance.data.labels = labels;
    stockChartInstance.data.datasets[0].data = data;
    stockChartInstance.update();
  } else {
    stockChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          label: 'Current Stock (Units)',
          data: data,
          backgroundColor: [
            'rgba(37, 99, 235, 0.7)',
            'rgba(59, 130, 246, 0.7)',
            'rgba(99, 102, 241, 0.7)',
            'rgba(139, 92, 246, 0.7)',
            'rgba(168, 85, 247, 0.7)',
            'rgba(236, 72, 153, 0.7)'
          ],
          borderColor: [
            'rgba(37, 99, 235, 1)',
            'rgba(59, 130, 246, 1)',
            'rgba(99, 102, 241, 1)',
            'rgba(139, 92, 246, 1)',
            'rgba(168, 85, 247, 1)',
            'rgba(236, 72, 153, 1)'
          ],
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    });
  }
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
  modalPrice = document.getElementById('modalPrice');
  modalPrice.value = p.price || '';
  modalQuantity.value = p.quantity;
  document.getElementById('modalUnit').value = p.unit || '';
  modal.classList.add("show");
};

// 🔹 Save from Modal
modalForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const newId = modalProductId.value.trim();
  const name = modalName.value.trim();
  const category = modalCategory.value.trim();
  const price = parseFloat(document.getElementById('modalPrice').value);
  const quantity = parseInt(modalQuantity.value);
  const unit = document.getElementById('modalUnit').value.trim();

  if (newId !== editingId) {
    await setDoc(doc(db, "products", newId), { id: newId, name, category, price, quantity, unit });
    await deleteDoc(doc(db, "products", editingId));
  } else {
    await updateDoc(doc(db, "products", editingId), { id: newId, name, category, price, quantity, unit });
  }
  modal.classList.remove("show");
  editingId = null;
});

// Modal close button handler
const modalCloseBtn = document.querySelector('.modal-close');
if (modalCloseBtn) {
  modalCloseBtn.addEventListener('click', () => {
    modal.classList.remove('show');
    editingId = null;
  });
}

// 🔹 Cancel modal
modalCancel.addEventListener("click", () => {
  modal.classList.remove("show");
  editingId = null;
});

// 🔹 Delete Product Modal
window.openDeleteModal = (id) => {
  if (currentRole !== 'Admin' && currentRole !== 'Staff') return alert('Permission denied');
  if (confirm("Archive (hide) this product?")) {
    // Archive by setting `archived` flag rather than deleting
    updateDoc(doc(db, 'products', id), { archived: true }).catch(err => console.error(err));
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

// Navigation and role-based UI
const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.section');

navItems.forEach(item => {
  item.addEventListener('click', () => {
    const sectionId = item.dataset.section;
    showSection(sectionId);
    // Update active nav
    navItems.forEach(n => n.classList.remove('active'));
    item.classList.add('active');
  });
});

function showSection(id) {
  sections.forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
  
  // Initialize charts when dashboard is shown
  if (id === 'dashboard') {
    setTimeout(() => {
      updateStockChart();
      updateSalesChart();
    }, 100);
  }
}

// Stock in/out handlers (front-end + firestore update & logs)
const stockInForm = document.getElementById('stockInForm');
const stockOutForm = document.getElementById('stockOutForm');
const logsTableBody = document.querySelector('#logsTable tbody');

if (stockInForm) {
  stockInForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return alert('Not authenticated');
    const prod = document.getElementById('stockInProduct').value.trim();
    const qty = parseInt(document.getElementById('stockInQty').value, 10);
    const remarks = document.getElementById('stockInRemarks').value.trim();
    await recordStockChange(prod, qty, 'in', remarks);
    stockInForm.reset();
  });
}

if (stockOutForm) {
  stockOutForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return alert('Not authenticated');
    const prod = document.getElementById('stockOutProduct').value.trim();
    const qty = parseInt(document.getElementById('stockOutQty').value, 10);
    const reason = document.getElementById('stockOutReason').value;
    await recordStockChange(prod, qty, 'out', reason);
    stockOutForm.reset();
  });
}

async function recordStockChange(productIdentifier, qty, type, remarks) {
  try {
    // attempt to find product by id or name
    const prod = allProducts.find(p => p.id === productIdentifier || p.name === productIdentifier);
    if (!prod) return alert('Product not found');
    const newQty = type === 'in' ? (prod.quantity || 0) + qty : (prod.quantity || 0) - qty;
    await updateDoc(doc(db, 'products', prod.id), { quantity: newQty });
    await addDoc(collection(db, 'logs'), {
      productId: prod.id,
      productName: prod.name,
      type,
      qty,
      remarks: remarks || '',
      userId: currentUser.uid,
      userEmail: currentUser.email || '',
      timestamp: serverTimestamp()
    });
    // refresh logs view briefly
    loadRecentLogs();
  } catch (err) { console.error(err); alert('Error recording stock change'); }
}

// Filter logs based on current filter values
function filterLogs(logs) {
  const productFilter = document.getElementById('logProductFilter').value.toLowerCase();
  const typeFilter = document.getElementById('logType').value;
  const fromDate = document.getElementById('logFrom').value;
  const toDate = document.getElementById('logTo').value;

  return logs.filter(log => {
    // Filter by product (name or ID)
    if (productFilter) {
      const matchesName = log.productName?.toLowerCase().includes(productFilter) || false;
      const matchesId = log.productId?.toLowerCase().includes(productFilter) || false;
      if (!matchesName && !matchesId) return false;
    }

    // Filter by type (in/out)
    if (typeFilter && log.type !== typeFilter) {
      return false;
    }

    // Filter by date range
    if (log.timestamp) {
      const logDate = new Date(log.timestamp.seconds * 1000).toISOString().split('T')[0];
      if (fromDate && logDate < fromDate) return false;
      if (toDate && logDate > toDate) return false;
    }

    return true;
  });
}

// Apply filters and render logs
function applyLogFilters() {
  const logs = Array.from(document.querySelectorAll('#logsTable tbody tr'));
  logs.forEach(row => {
    const productCell = row.cells[2].textContent.toLowerCase();
    const typeCell = row.cells[3].textContent.toLowerCase();
    const dateCell = new Date(row.cells[0].textContent).toISOString().split('T')[0];
    
    const productFilter = document.getElementById('logProductFilter').value.toLowerCase();
    const typeFilter = document.getElementById('logType').value.toLowerCase();
    const fromDate = document.getElementById('logFrom').value;
    const toDate = document.getElementById('logTo').value;
    
    let shouldShow = true;
    
    // Filter by product
    if (productFilter && !productCell.includes(productFilter)) {
      shouldShow = false;
    }
    
    // Filter by type
    if (typeFilter && typeCell !== typeFilter) {
      shouldShow = false;
    }
    
    // Filter by date range
    if (fromDate && dateCell < fromDate) {
      shouldShow = false;
    }
    if (toDate && dateCell > toDate) {
      shouldShow = false;
    }
    
    row.style.display = shouldShow ? '' : 'none';
  });
}

// Load recent logs for Logs section
function loadRecentLogs() {
  onSnapshot(collection(db, 'logs'), (snap) => {
    const rows = [];
    snap.forEach(s => rows.push({ id: s.id, ...s.data() }));
    
    // Sort by timestamp descending (newest first)
    rows.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
    
    // Apply filters
    const filteredLogs = filterLogs(rows);
    
    // Render logs
    logsTableBody.innerHTML = '';
    filteredLogs.forEach(r => {
      const product = allProducts.find(p => p.id === r.productId);
      const price = product ? product.price || 0 : 0;
      // Only show total sales for items marked as 'sold'
      const totalSales = (r.type === 'out' && r.remarks === 'sold') ? (price * r.qty).toFixed(2) : '-';
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.timestamp ? new Date(r.timestamp.seconds * 1000).toLocaleString() : ''}</td>
        <td>${r.userEmail || r.userId || ''}</td>
        <td>${r.productName || r.productId || ''}</td>
        <td>${r.type || ''}</td>
        <td>${r.qty || 0}</td>
        <td>₱${price.toFixed(2)}</td>
        <td>${totalSales === '-' ? '-' : '₱' + totalSales}</td>
        <td>${r.remarks || ''}</td>
      `;
      logsTableBody.appendChild(tr);
    });
  });
}

// Add event listeners for filter changes
document.addEventListener('DOMContentLoaded', () => {
  const logProductFilter = document.getElementById('logProductFilter');
  const logType = document.getElementById('logType');
  const logFrom = document.getElementById('logFrom');
  const logTo = document.getElementById('logTo');
  
  [logProductFilter, logType, logFrom, logTo].forEach(element => {
    if (element) {
      element.addEventListener('change', loadRecentLogs);
      element.addEventListener('input', loadRecentLogs);
    }
  });
});

// Auth state -> determine role and show/hide admin UI
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (!user) return window.location.href = 'login.html';
  // Display user email in header
  const userEmail = document.getElementById('userEmail');
  if (userEmail) userEmail.textContent = user.email || 'User';
  
  // fetch user doc to get role
  try {
    const ud = await getDoc(doc(db, 'users', user.uid));
    currentRole = ud.exists() ? (ud.data().role || 'Viewer') : 'Viewer';
  } catch (err) { console.error('user role fetch error', err); currentRole = 'Viewer'; }
  
  // apply role to UI
  document.querySelectorAll('.admin-only').forEach(el => {
    if (currentRole === 'Admin') {
      el.classList.add('show');
      el.style.display = 'flex';
    }
  });
  
  // set default landing section based on role
  showSection('dashboard');
  document.querySelector('[data-section="dashboard"]').classList.add('active');
  
  // initialize dashboard
  updateDashboardCards(allProducts);
  updateTotalSales();
  updateStockMovementToday();
  updateStockChart();
  updateSalesChart();
  loadRecentLogs();
});

// -----------------
// Admin: User management (Firestore-based)
// -----------------
const createUserForm = document.getElementById('createUserForm');
const usersTableBody = document.querySelector('#usersTable tbody');

function renderUsers(users) {
  usersTableBody.innerHTML = '';
  users.forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${u.email || ''}</td>
      <td>${u.role || 'Viewer'}</td>
      <td>${u.disabled ? 'No' : 'Yes'}</td>
      <td>
        <button data-id="${u._id}" class="btn-role">Change Role</button>
        <button data-id="${u._id}" class="btn-toggle">Enable/Disable</button>
        <button data-id="${u._id}" class="btn-delete">Delete</button>
      </td>
    `;
    usersTableBody.appendChild(tr);
  });
}

// Mobile Menu Toggle
const hamburgerMenu = document.querySelector('.hamburger-menu');
const sidebar = document.querySelector('.sidebar');

if (hamburgerMenu && sidebar) {
  hamburgerMenu.addEventListener('click', () => {
    sidebar.classList.toggle('active');
    hamburgerMenu.classList.toggle('active');
    
    // Animate hamburger to X
    const spans = hamburgerMenu.querySelectorAll('span');
    if (hamburgerMenu.classList.contains('active')) {
      spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
      spans[1].style.opacity = '0';
      spans[2].style.transform = 'rotate(-45deg) translate(7px, -6px)';
    } else {
      spans[0].style.transform = 'none';
      spans[1].style.opacity = '1';
      spans[2].style.transform = 'none';
    }
  });
  
  // Close menu when clicking on a nav item
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        sidebar.classList.remove('active');
        hamburgerMenu.classList.remove('active');
        const spans = hamburgerMenu.querySelectorAll('span');
        spans[0].style.transform = 'none';
        spans[1].style.opacity = '1';
        spans[2].style.transform = 'none';
      }
    });
  });
}

// Listen to users collection
const usersColRef = collection(db, 'users');
onSnapshot(usersColRef, (snap) => {
  const arr = [];
  snap.forEach(s => {
    const d = s.data();
    d._id = s.id;
    arr.push(d);
  });
  renderUsers(arr);
});

// Create user (Firestore document only)
if (createUserForm) {
  createUserForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (currentRole !== 'Admin') return alert('Permission denied');
    const email = document.getElementById('newUserEmail').value.trim();
    const name = document.getElementById('newUserName').value.trim();
    const role = document.getElementById('newUserRole').value;
    const enabled = document.getElementById('newUserEnabled').checked;
    try {
      // Create a Firestore user document. This does NOT create an Auth account.
      const id = email.replace(/[^a-zA-Z0-9]/g, '_');
      await setDoc(doc(db, 'users', id), {
        email,
        displayName: name || '',
        role,
        disabled: !enabled,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp()
      });
      createUserForm.reset();
      alert('User document created in Firestore. To create an Auth account, use the provided Cloud Function sample.');
    } catch (err) { console.error(err); alert('Error creating user doc'); }
  });
}

// Event delegation for user table
usersTableBody?.addEventListener('click', async (e) => {
  const btn = e.target;
  if (!btn.dataset || !btn.dataset.id) return;
  const id = btn.dataset.id;
  if (btn.classList.contains('btn-role')) {
    const newRole = prompt('Enter new role for user (Admin / Staff / Viewer):');
    if (!newRole) return;
    await updateDoc(doc(db, 'users', id), { role: newRole });
  } else if (btn.classList.contains('btn-toggle')) {
    const ud = await getDoc(doc(db, 'users', id));
    if (!ud.exists()) return alert('User doc missing');
    const cur = ud.data();
    await updateDoc(doc(db, 'users', id), { disabled: !cur.disabled });
  } else if (btn.classList.contains('btn-delete')) {
    if (!confirm('Delete user document? This does not delete Auth account.')) return;
    await deleteDoc(doc(db, 'users', id));
  }
});

// -----------------
// End admin user management
// -----------------
