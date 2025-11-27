import { db, auth } from "./firebase.js";
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  deleteDoc,
  updateDoc,
  getDoc,
  getDocs,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp
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

  if (!id) {
    alert("Please enter a Product ID");
    return;
  }

  // Show confirmation dialog
  const confirmation = confirm(`Are you sure you want to add this product?\n\nID: ${id}\nName: ${name}\nCategory: ${category}\nPrice: ${price}\nUnit: ${unit}\nQuantity: ${quantity}`);
  
  if (!confirmation) {
    return; // User cancelled the operation
  }

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
    showNotification("Product added successfully! The dashboard has been updated.", 'success');
    
    // Force a refresh of all dashboard components
    updateDashboardCards(allProducts);
    updateStockMovementToday();
    updateTodaysSales();
    updateTotalSales();
    updateStockChart();
  } catch (err) { 
    console.error(err);
    alert("Error adding product: " + err.message);
  }
});

// 🔹 Real-time display
const unsubscribeProducts = onSnapshot(collection(db, "products"), (snapshot) => {
  const updatedProducts = [];
  snapshot.forEach((docSnap) => updatedProducts.push(docSnap.data()));
  allProducts = updatedProducts;
  
  // Update products display
  displayProducts(allProducts);
  
  // Update dashboard components
  updateDashboardCards(allProducts);
  updateStockMovementToday();
  updateTotalSales();
  updateTodaysSales();
  updateStockChart();
  
  // If on POS section, update product availability
  if (document.querySelector('#pos.section.active')) {
    loadProductsForPOS(allProducts);
  }
  
  // Update cart with latest product data
  updateCartWithLatestData();
  
  // Force update any charts that might need it
  if (salesChartInstance) {
    updateSalesChart();
  }
  if (stockChartInstance) {
    updateStockChart();
  }
  
  console.log('Dashboard updated with latest product data');
}, (error) => {
  console.error('Error receiving real-time product updates:', error);
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
        <td class="quantity-cell">
          <button class="btn-decrement" data-id="${p.id}">-</button>
          <input type="number" class="quantity-input" value="${p.quantity}" min="0" data-id="${p.id}">
          <button class="btn-increment" data-id="${p.id}">+</button>
        </td>
        <td class="action-buttons">
          <button class="btn-update" data-id="${p.id}">Update</button>
          <button class="btn-delete" data-id="${p.id}">Delete</button>
        </td>
      </tr>
    `;
  });
  
  // Add event listeners for the new buttons
  document.querySelectorAll('.btn-increment').forEach(btn => {
    btn.addEventListener('click', handleIncrement);
  });
  
  document.querySelectorAll('.btn-decrement').forEach(btn => {
    btn.addEventListener('click', handleDecrement);
  });
  
  document.querySelectorAll('.btn-update').forEach(btn => {
    btn.addEventListener('click', handleUpdate);
  });
  
  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', handleDelete);
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
  try {
    const total = products.length;
    const threshold = parseInt(minStockInput?.value || 5, 10);
    const low = products.filter(p => (p.quantity || 0) <= (p.minStock || threshold)).length;
    
    const totalProductsEl = document.getElementById('totalProducts');
    const lowStockCountEl = document.getElementById('lowStockCount');
    
    if (totalProductsEl) totalProductsEl.textContent = total;
    if (lowStockCountEl) lowStockCountEl.textContent = low;
    
    // Also update any other dashboard elements that might show stock information
    const stockValueEl = document.getElementById('stockValue');
    if (stockValueEl) {
      const totalValue = products.reduce((sum, p) => sum + ((p.price || 0) * (p.quantity || 0)), 0);
      stockValueEl.textContent = `₱${totalValue.toFixed(2)}`;
    }
    
    // Update the products count in the dashboard if it exists
    const dashboardProductsCount = document.querySelector('.dashboard-card:nth-child(1) .card-value');
    if (dashboardProductsCount) {
      dashboardProductsCount.textContent = total;
    }
    
    console.log('Dashboard cards updated:', { totalProducts: total, lowStockCount: low });
  } catch (error) {
    console.error('Error updating dashboard cards:', error);
  }
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

// Update dashboard when products change
const productsQuery = query(collection(db, 'products'));
onSnapshot(productsQuery, (snapshot) => {
  // Update today's sales when products change (in case of new sales)
  updateTodaysSales();
  let movementCount = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  snapshot.forEach(doc => {
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

// Calculate today's sales
async function updateTodaysSales() {
  try {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    // Query transactions for today
    const transactionsRef = collection(db, 'transactions');
    const q = query(
      transactionsRef,
      where('date', '>=', startOfDay)
    );
    
    const querySnapshot = await getDocs(q);
    let totalSales = 0;
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      totalSales += data.total || 0;
    });
    
    // Update the UI
    const todaysSalesElement = document.getElementById('todaysSales');
    if (todaysSalesElement) {
      todaysSalesElement.textContent = `₱${totalSales.toFixed(2)}`;
    }
    
    return totalSales;
  } catch (error) {
    console.error('Error calculating today\'s sales:', error);
    return 0;
  }
}

// Calculate total sales from all transactions
async function updateTotalSales() {
  try {
    // Import required Firestore functions
    const { collection, query, where, getDocs } = await import('https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js');
    
    // Query all sale transactions
    const transactionsQuery = query(
      collection(db, 'transactions'),
      where('type', '==', 'sale')
    );
    
    const querySnapshot = await getDocs(transactionsQuery);
    let totalSales = 0;
    
    // Sum up the total from each sale transaction
    querySnapshot.forEach((doc) => {
      const transaction = doc.data();
      totalSales += parseFloat(transaction.total) || 0;
    });
    
    // Format the total with 2 decimal places and add currency symbol
    const formattedTotal = totalSales.toLocaleString('en-PH', { 
      style: 'currency', 
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2 
    });
    
    // Update the dashboard card
    const totalSalesElement = document.getElementById('totalSales');
    if (totalSalesElement) {
      totalSalesElement.textContent = formattedTotal;
      
      // Also update the total in the POS cart if it exists
      const cartTotalElement = document.getElementById('cartTotal');
      if (cartTotalElement) {
        cartTotalElement.textContent = formattedTotal;
      }
    }
    
    return totalSales;
  } catch (err) {
    console.error('Error in updateTotalSales:', err);
    const totalSalesElement = document.getElementById('totalSales');
    if (totalSalesElement) {
      totalSalesElement.textContent = '₱0.00';
    }
    return 0;
  }
}


// Chart instances
let salesChartInstance = null;
let stockChartInstance = null;

// Date range filter state
let dateRange = {
  startDate: null,
  endDate: null
};

// Initialize date range pickers
document.addEventListener('DOMContentLoaded', () => {
  // Set default date range to current month
  // Initialize date range for sales chart
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1); // Default to last 30 days
  
  // Format date as YYYY-MM-DD for date inputs
  function formatDate(date) {
    if (!(date instanceof Date)) {
      date = new Date(date);
    }
    
    // Handle invalid dates
    if (isNaN(date.getTime())) {
      console.error('Invalid date provided to formatDate');
      return '';
    }
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const startDateInput = document.getElementById('salesStartDate');
  const endDateInput = document.getElementById('salesEndDate');
  const applyFilterBtn = document.getElementById('applyDateFilter');
  const resetFilterBtn = document.getElementById('resetDateFilter');

  if (startDateInput && endDateInput) {
    // Set default date range (last 30 days)
    startDateInput.value = formatDate(firstDay);
    endDateInput.value = formatDate(today);
    
    // Initialize dateRange object
    window.dateRange = {
      startDate: firstDay,
      endDate: today
    };

    // Apply filter when button is clicked
    applyFilterBtn?.addEventListener('click', () => {
      const startDate = new Date(startDateInput.value);
      const endDate = new Date(endDateInput.value);
      
      if (startDate && endDate) {
        if (startDate > endDate) {
          alert('Start date cannot be after end date');
          return;
        }
        
        // Set time to start and end of day for proper date comparison
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        
        window.dateRange = { 
          startDate, 
          endDate 
        };
        
        updateSalesChart();
      } else {
        alert('Please select valid start and end dates');
      }
    });

    // Reset filter to default (last 30 days)
    resetFilterBtn?.addEventListener('click', () => {
      const newStartDate = new Date();
      newStartDate.setMonth(newStartDate.getMonth() - 1);
      
      startDateInput.value = formatDate(newStartDate);
      endDateInput.value = formatDate(today);
      
      newStartDate.setHours(0, 0, 0, 0);
      const end = new Date(today);
      end.setHours(23, 59, 59, 999);
      
      window.dateRange = {
        startDate: newStartDate,
        endDate: end
      };
      
      updateSalesChart();
    });
    
    // Initial chart load
    updateSalesChart();
  }
});

// Update Sales Chart
async function updateSalesChart() {
  const chartContainer = document.getElementById('movementTrend');
  
  try {
    // Show loading state
    if (chartContainer) {
      chartContainer.innerHTML = `
        <div class="chart-loading">
          <div class="spinner"></div>
          <p>Loading sales data...</p>
        </div>
        <canvas id="salesChart" style="display: none;"></canvas>
      `;
    }

    // Get date range from the global dateRange object
    const { startDate, endDate } = window.dateRange || {};
    
    if (!startDate || !endDate) {
      console.error('Date range not properly initialized');
      return;
    }
    
    // Create new date objects to avoid reference issues
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    
    console.log('Fetching sales data for range:', start, 'to', end);
    
    // Get transactions data with date range filter
    const transactionsQuery = query(
      collection(db, 'transactions'),
      where('type', '==', 'sale'),
      where('timestamp', '>=', start),
      where('timestamp', '<=', end),
      orderBy('timestamp', 'asc')
    );
    
    const transactionsSnapshot = await getDocs(transactionsQuery);
    console.log('Found', transactionsSnapshot.size, 'transactions in date range');
    
    // Group sales by date
    const salesByDate = {};
    let hasValidTransactions = false;
    
    // Create a map of all dates in the range with zero sales initially
    const allDates = [];
    const currentDate = new Date(start);
    while (currentDate <= end) {
      const dateStr = currentDate.toISOString().split('T')[0];
      salesByDate[dateStr] = 0;
      allDates.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Process each transaction
    transactionsSnapshot.forEach(doc => {
      const transaction = doc.data();
      
      // Handle different timestamp formats
      let transactionDate;
      if (transaction.date?.toDate) {
        transactionDate = transaction.date.toDate();
      } else if (transaction.timestamp?.toDate) {
        transactionDate = transaction.timestamp.toDate();
      } else if (transaction.date?.seconds) {
        transactionDate = new Date(transaction.date.seconds * 1000);
      } else if (transaction.timestamp?.seconds) {
        transactionDate = new Date(transaction.timestamp.seconds * 1000);
      } else if (transaction.date) {
        transactionDate = new Date(transaction.date);
      } else {
        console.warn('Transaction has no valid date:', doc.id);
        return; // Skip transactions without a valid date
      }
      
      const dateStr = transactionDate.toISOString().split('T')[0];
      
      // Process each item in the transaction
      if (transaction.items && Array.isArray(transaction.items)) {
        hasValidTransactions = true;
        const dailyTotal = transaction.items.reduce((sum, item) => {
          if (item && item.quantity > 0) {
            const price = parseFloat(item.price) || 0;
            const quantity = parseInt(item.quantity) || 0;
            return sum + (price * quantity);
          }
          return sum;
        }, 0);
        
        salesByDate[dateStr] = (salesByDate[dateStr] || 0) + dailyTotal;
      }
    });
    
    // Update the chart title with date range
    const chartTitle = document.querySelector('#movementTrend h3');
    if (chartTitle) {
      const startDateStr = start.toLocaleDateString();
      const endDateStr = end.toLocaleDateString();
      chartTitle.textContent = `Daily Sales (${startDateStr} to ${endDateStr})`;
    }
    
    // Prepare data for chart
    const labels = allDates.map(date => {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    
    const data = allDates.map(date => {
      const dateStr = date.toISOString().split('T')[0];
      return salesByDate[dateStr] || 0;
    });
    
    // Show no data message if no sales found
    if (!hasValidTransactions) {
      if (chartContainer) {
        const startDateStr = start.toLocaleDateString();
        const endDateStr = end.toLocaleDateString();
        
        chartContainer.innerHTML = `
          <div class="no-data" style="text-align: center; padding: 2rem;">
            <p>No sales data found for the selected date range.</p>
            <p>Date Range: ${startDateStr} to ${endDateStr}</p>
            <button onclick="updateSalesChart()" class="btn btn-primary" style="margin-top: 1rem;">
              <i class="fas fa-sync"></i> Refresh
            </button>
            <button onclick="document.getElementById('resetDateFilter').click()" class="btn btn-secondary" style="margin-top: 0.5rem;">
              <i class="fas fa-calendar-alt"></i> Reset Date Range
            </button>
          </div>
          <canvas id="salesChart" style="display: none;"></canvas>
        `;
      }
      return;
    }
    
    // Get the context of the chart
    const ctx = document.getElementById('salesChart');
    if (!ctx) return;
    
    // Show the canvas
    if (chartContainer) {
      const canvas = chartContainer.querySelector('canvas');
      if (canvas) canvas.style.display = 'block';
    }

    // Create or update the chart
    if (salesChartInstance) {
      salesChartInstance.data.labels = labels;
      salesChartInstance.data.datasets[0].data = data;
      salesChartInstance.update();
    } else {
      salesChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Daily Sales (₱)',
            data: data,
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderColor: 'rgba(59, 130, 246, 0.8)',
            borderWidth: 2,
            pointBackgroundColor: 'rgba(59, 130, 246, 1)',
            pointBorderColor: '#fff',
            pointHoverRadius: 5,
            pointHoverBackgroundColor: 'rgba(59, 130, 246, 1)',
            pointHoverBorderColor: '#fff',
            pointHitRadius: 10,
            pointBorderWidth: 2,
            tension: 0.1,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { 
              display: true,
              position: 'top'
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  return `₱${context.raw.toFixed(2)}`;
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: { 
                display: true, 
                text: 'Revenue (₱)' 
              },
              ticks: {
                callback: function(value) {
                  return '₱' + value.toLocaleString();
                }
              }
            },
            x: {
              title: {
                display: true,
                text: 'Date'
              },
              ticks: {
                autoSkip: true,
                maxRotation: 45,
                minRotation: 30
              }
            }
          }
        }
      });
    }
  } catch (err) {
    console.error('Error updating sales chart:', err);
    // Show error message to user
    const chartContainer = document.getElementById('movementTrend');
    if (chartContainer) {
      chartContainer.innerHTML = `
        <div class="error-message">
          <p>Error loading sales data: ${err.message || 'Unknown error'}</p>
          <button onclick="updateSalesChart()" class="btn btn-primary">Retry</button>
        </div>
        <canvas id="salesChart" style="display: none;"></canvas>
      `;
    }
  }
}

// Handle increment button click
async function handleIncrement(e) {
  const productId = e.target.dataset.id;
  const input = document.querySelector(`.quantity-input[data-id="${productId}"]`);
  input.value = parseInt(input.value) + 1;
}

// Handle decrement button click
async function handleDecrement(e) {
  const productId = e.target.dataset.id;
  const input = document.querySelector(`.quantity-input[data-id="${productId}"]`);
  const newValue = Math.max(0, parseInt(input.value) - 1);
  input.value = newValue;
}

// Handle delete button click
async function handleDelete(e) {
  if (!confirm('Are you sure you want to delete this product? This action cannot be undone.')) {
    return;
  }
  
  const id = e.target.dataset.id;
  try {
    const product = allProducts.find(p => p.id === id);
    if (product) {
      // Log the deletion
      await addLogEntry(
        id,
        product.name,
        0,
        'delete',
        'Product deleted from inventory'
      );
      
      // Delete the product from Firestore
      await deleteDoc(doc(db, "products", id));
      
      alert('Product deleted successfully!');
    }
  } catch (err) {
    console.error('Error deleting product:', err);
    alert('Error deleting product: ' + err.message);
  }
}

// Handle update button click
async function handleUpdate(e) {
  const productId = e.target.dataset.id;
  const input = document.querySelector(`.quantity-input[data-id="${productId}"]`);
  const newQuantity = parseInt(input.value);
  
  if (isNaN(newQuantity) || newQuantity < 0) {
    alert('Please enter a valid quantity');
    return;
  }
  
  try {
    const productDoc = await getDoc(doc(db, "products", productId));
    if (!productDoc.exists()) {
      throw new Error('Product not found');
    }
    
    const productData = productDoc.data();
    const oldQuantity = productData.quantity || 0;
    const quantityDiff = newQuantity - oldQuantity;
    
    if (quantityDiff === 0) {
      return; // No change needed
    }
    
    // Update the product quantity in Firestore
    await updateDoc(doc(db, "products", productId), {
      quantity: newQuantity
    });
    
    // Log the stock change
    const logType = quantityDiff > 0 ? 'in' : 'out';
    const absDiff = Math.abs(quantityDiff);
    await addLogEntry(
      productId,
      productData.name,
      absDiff,
      logType,
      `Stock ${logType === 'in' ? 'added' : 'removed'} via quantity update`
    );
    
    alert(`Stock updated successfully! ${absDiff} items ${logType === 'in' ? 'added to' : 'removed from'} inventory.`);
  } catch (error) {
    console.error('Error updating product quantity:', error);
    alert('Error updating product quantity: ' + error.message);
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
  if (logs.length === 0) return;
  
  const productFilter = document.getElementById('logProductFilter')?.value?.toLowerCase() || '';
  const typeFilter = document.getElementById('logType')?.value?.toLowerCase() || '';
  const fromDate = document.getElementById('logFrom')?.value;
  const toDate = document.getElementById('logTo')?.value;
  
  logs.forEach(row => {
    const productCell = row.cells[2]?.textContent?.toLowerCase() || '';
    const typeCell = row.cells[3]?.textContent?.toLowerCase() || '';
    const dateCell = new Date(row.cells[0]?.textContent);
    const dateString = !isNaN(dateCell) ? dateCell.toISOString().split('T')[0] : '';
    
    let shouldShow = true;
    
    // Filter by product (name or ID)
    if (productFilter && !productCell.includes(productFilter)) {
      shouldShow = false;
    }
    
    // Filter by type (case-insensitive partial match)
    if (typeFilter && !typeCell.includes(typeFilter)) {
      shouldShow = false;
    }
    
    // Filter by date range
    if (fromDate && dateString < fromDate) {
      shouldShow = false;
    }
    if (toDate && dateString > toDate) {
      shouldShow = false;
    }
    
    row.style.display = shouldShow ? '' : 'none';
  });
}

// Function to delete a log entry
async function deleteLog(logId) {
  if (!confirm('Are you sure you want to delete this log entry? This action cannot be undone.')) {
    return;
  }

  try {
    await deleteDoc(doc(db, 'logs', logId));
    console.log('Log entry deleted successfully');
  } catch (error) {
    console.error('Error deleting log entry:', error);
    alert('Error deleting log entry: ' + error.message);
  }
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
      // For sales, we'll get the price from the remarks if available
      let price = 0;
      if (r.type === 'sale' && r.remarks) {
        // Extract price from remarks if it's a sale
        const priceMatch = r.remarks.match(/at ₱([\d.]+)/);
        price = priceMatch ? parseFloat(priceMatch[1]) : (product ? product.price : 0);
      } else {
        price = product ? product.price || 0 : 0;
      }
      
      const tr = document.createElement('tr');
      tr.setAttribute('data-log-id', r.id);
      tr.innerHTML = `
        <td>${r.timestamp ? new Date(r.timestamp.seconds * 1000).toLocaleString() : ''}</td>
        <td>${r.userEmail || r.userId || ''}</td>
        <td>${r.productName || r.productId || ''}</td>
        <td>${r.type || ''}</td>
        <td>${r.qty || 0}</td>
        <td>${r.type === 'sale' ? `₱${price.toFixed(2)}` : '-'}</td>
        <td>${r.type === 'sale' ? `₱${(r.qty * price).toFixed(2)}` : '-'}</td>
        <td>${r.remarks || ''}</td>
        <td>
          <button class="btn-delete-log" data-log-id="${r.id}" title="Delete log entry">
            🗑️
          </button>
        </td>
      `;
      logsTableBody.appendChild(tr);
      
      // Add click event to the delete button
      const deleteBtn = tr.querySelector('.btn-delete-log');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteLog(r.id);
        });
      }
    });
  });
}

// Initialize POS System
let cart = [];

// POS Elements
const posSearchInput = document.getElementById('posSearch');
const posProductsList = document.getElementById('posProductsList');
const cartItems = document.getElementById('cartItems');
const cartSubtotal = document.getElementById('cartSubtotal');
const cartTax = document.getElementById('cartTax');
const cartTotal = document.getElementById('cartTotal');
const clearCartBtn = document.getElementById('clearCart');
const checkoutBtn = document.getElementById('checkoutBtn');

// Load products for POS
function loadProductsForPOS(products) {
  posProductsList.innerHTML = '';
  
  products.forEach(product => {
    const productCard = document.createElement('div');
    productCard.className = 'product-card';
    productCard.innerHTML = `
      <div class="product-name">${product.name}</div>
      <div class="product-price">₱${(product.price || 0).toFixed(2)}</div>
      <div class="product-stock">${product.quantity || 0} ${product.unit || 'pcs'} in stock</div>
    `;
    
    productCard.addEventListener('click', () => addToCart(product));
    posProductsList.appendChild(productCard);
  });
}

// Add product to cart
function addToCart(product) {
  const existingItem = cart.find(item => item.id === product.id);
  
  if (existingItem) {
    // Check if we have enough stock
    if (existingItem.quantity >= product.quantity) {
      alert('Not enough stock available');
      return;
    }
    existingItem.quantity += 1;
  } else {
    if (product.quantity < 1) {
      alert('This product is out of stock');
      return;
    }
    cart.push({
      ...product,
      quantity: 1
    });
  }
  
  updateCart();
}

// Update cart UI
function updateCart() {
  // Remove any items that no longer exist in inventory
  cart = cart.filter(item => allProducts.some(p => p.id === item.id));
  // Clear current cart display
  cartItems.innerHTML = '';
  
  if (cart.length === 0) {
    cartItems.innerHTML = `
      <div class="empty-cart">
        <p>Your cart is empty</p>
        <p>Search and add products to get started</p>
      </div>
    `;
    checkoutBtn.disabled = true;
    // Explicitly set totals to zero when cart is empty
    cartSubtotal.textContent = '₱0.00';
    cartTotal.textContent = '₱0.00';
    return; // Exit early since there are no items to process
  } else {
    cart.forEach(item => {
      const cartItem = document.createElement('div');
      cartItem.className = 'cart-item';
      cartItem.innerHTML = `
        <div class="cart-item-details">
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-price">₱${(item.price * item.quantity).toFixed(2)}</div>
        </div>
        <div class="cart-item-quantity">
          <button class="decrease-quantity" data-id="${item.id}">-</button>
          <span>${item.quantity}</span>
          <button class="increase-quantity" data-id="${item.id}" ${item.quantity >= item.stock ? 'disabled' : ''}>+</button>
        </div>
        <button class="cart-item-remove" data-id="${item.id}">×</button>
      `;
      cartItems.appendChild(cartItem);
    });
    
    // Add event listeners to the new buttons
    document.querySelectorAll('.decrease-quantity').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.getAttribute('data-id');
        updateCartItemQuantity(id, -1);
      });
    });
    
    document.querySelectorAll('.increase-quantity').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.getAttribute('data-id');
        updateCartItemQuantity(id, 1);
      });
    });
    
    document.querySelectorAll('.cart-item-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.getAttribute('data-id');
        removeFromCart(id);
      });
    });
    
    checkoutBtn.disabled = false;
  }
  
  // Update totals
  updateCartTotals();
}

// Update item quantity in cart
function updateCartItemQuantity(productId, change) {
  const item = cart.find(item => item.id === productId);
  if (!item) return;
  
  const newQuantity = item.quantity + change;
  
  if (newQuantity < 1) {
    removeFromCart(productId);
    return;
  }
  
  // Check stock
  const product = allProducts.find(p => p.id === productId);
  if (product && newQuantity > product.quantity) {
    alert('Not enough stock available');
    return;
  }
  
  item.quantity = newQuantity;
  updateCart();
}

// Remove item from cart
function removeFromCart(productId) {
  cart = cart.filter(item => item.id !== productId);
  updateCart();
}

// Update cart totals
function updateCartTotals() {
  if (cart.length === 0) {
    // Explicitly set totals to zero when cart is empty
    cartSubtotal.textContent = '₱0.00';
    cartTotal.textContent = '₱0.00';
    return;
  }
  
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  cartSubtotal.textContent = `₱${subtotal.toFixed(2)}`;
  cartTotal.textContent = `₱${subtotal.toFixed(2)}`;
}

// Clear cart
function clearCart() {
  cart = [];
  // Update cart display directly without triggering additional updates
  cartItems.innerHTML = `
    <div class="empty-cart">
      <p>Your cart is empty</p>
      <p>Search and add products to get started</p>
    </div>
  `;
  cartSubtotal.textContent = '₱0.00';
  cartTotal.textContent = '₱0.00';
  checkoutBtn.disabled = true;
}

// Update cart with latest product data
function updateCartWithLatestData() {
  if (cart.length === 0) return;
  
  let needsUpdate = false;
  cart = cart.map(item => {
    const product = allProducts.find(p => p.id === item.id);
    if (!product) return item;
    
    // Check if price or name has changed
    if (product.price !== item.price || product.name !== item.name) {
      needsUpdate = true;
      return { ...item, price: product.price, name: product.name };
    }
    return item;
  });
  
  if (needsUpdate) {
    updateCart();
  }
}

// Process checkout
async function processCheckout() {
  if (cart.length === 0) return;
  
  if (!confirm('Confirm sale of these items?')) {
    return;
  }

  try {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const total = subtotal;

    // Create a transaction record
    const transactionRef = await addDoc(collection(db, 'transactions'), {
      date: serverTimestamp(),
      items: cart.map(item => ({
        productId: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        unit: item.unit
      })),
      subtotal: subtotal,
      total: total,
      userId: auth.currentUser?.uid,
      userEmail: auth.currentUser?.email || 'anonymous',
      status: 'completed',
      type: 'sale'
    });

    // Process each item in the cart
    for (const item of cart) {
      const productRef = doc(db, 'products', item.id);
      const productDoc = await getDoc(productRef);
      
      if (productDoc.exists()) {
        const currentQty = productDoc.data().quantity || 0;
        const newQty = currentQty - item.quantity;
        
        // Update product quantity
        await updateDoc(productRef, { 
          quantity: newQty,
          lastUpdated: serverTimestamp()
        });
        
        // Item logging is now handled by the summary log below
      }
    }

    // Log each sold item with quantity and price
    for (const item of cart) {
      await addLogEntry(
        item.id,
        item.name,
        item.quantity,  // Quantity sold
        'sale',
        `Sold ${item.quantity} ${item.unit || 'pcs'} at ₱${item.price.toFixed(2)} each`
      );
    }

    // Show success message
    alert('Sale completed successfully!');
    
    // Clear cart and reset cart display
    cart = [];
    cartItems.innerHTML = `
      <div class="empty-cart">
        <p>Your cart is empty</p>
        <p>Search and add products to get started</p>
      </div>
    `;
    cartSubtotal.textContent = '₱0.00';
    cartTotal.textContent = '₱0.00';
    checkoutBtn.disabled = true;
    
    // Don't update the total sales display
    // updateTotalSales();
    
  } catch (error) {
    console.error('Error processing sale:', error);
    alert('Error processing sale: ' + error.message);
  }
}

// Handle refresh button click
function handleRefreshStock() {
  const refreshBtn = document.getElementById('refreshStockBtn');
  const icon = refreshBtn.querySelector('.icon');
  
  // Add loading class
  refreshBtn.disabled = true;
  icon.style.animation = 'spin 1s linear infinite';
  
  // Force reload products from Firestore
  loadProductsForPOS(allProducts);
  
  // Show success message
  showNotification('Stock refreshed successfully!', 'success');
  
  // Reset button state after a short delay
  setTimeout(() => {
    refreshBtn.disabled = false;
    icon.style.animation = '';
  }, 1000);
}

// Show notification function
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  // Remove notification after 3 seconds
  setTimeout(() => {
    notification.classList.add('fade-out');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Initialize POS event listeners
function initPOS() {
  // Clear any existing listeners to prevent duplicates
  if (window.posInitialized) {
    return;
  }
  window.posInitialized = true;
  
  // Clear cart button
  clearCartBtn.addEventListener('click', clearCart);
  
  // Checkout button
  checkoutBtn.addEventListener('click', processCheckout);
  
  // Refresh stock button
  const refreshBtn = document.getElementById('refreshStockBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', handleRefreshStock);
  }
  
  // Search functionality
  posSearchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const productCards = document.querySelectorAll('.product-card');
    
    productCards.forEach(card => {
      const name = card.querySelector('.product-name').textContent.toLowerCase();
      if (name.includes(searchTerm)) {
        card.style.display = 'flex';
      } else {
        card.style.display = 'none';
      }
    });
  });
  
  // Load products when POS section is shown
  document.querySelector('[data-section="pos"]').addEventListener('click', () => {
    loadProductsForPOS(allProducts);
  });
}

// Format date as YYYY-MM-DD for date inputs
function formatDate(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Refresh dashboard data
async function refreshDashboard() {
  const refreshBtn = document.getElementById('refreshDashboard');
  const icon = refreshBtn.querySelector('.icon');
  
  // Add loading animation
  refreshBtn.disabled = true;
  icon.style.animation = 'spin 1s linear infinite';
  
  try {
    // Refresh products data
    const productsQuery = query(collection(db, 'products'));
    const snapshot = await getDocs(productsQuery);
    const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    allProducts = products;
    displayProducts(products);
    updateDashboardCards(products);
    updateStockChart();
    updateSalesChart();
    updateTodaysSales();
    updateTotalSales();
    updateStockMovementToday();
    showNotification('Dashboard refreshed successfully', 'success');
  } catch (error) {
    console.error('Error refreshing dashboard:', error);
    showNotification('Error refreshing dashboard', 'error');
  } finally {
    // Remove loading animation
    refreshBtn.disabled = false;
    icon.style.animation = 'none';
  }
}

// Add event listeners for filter changes and dashboard initialization
document.addEventListener('DOMContentLoaded', () => {
  // Initialize POS
  initPOS();
  
  // Update today's sales on page load
  updateTodaysSales().catch(console.error);
  
  // Set default date to today in the date picker and setup change listener
  const salesDateInput = document.getElementById('salesDate');
  const updateSalesBtn = document.getElementById('updateSalesBtn');
  
  if (salesDateInput && updateSalesBtn) {
    // Format today's date as YYYY-MM-DD for the date input
    const today = new Date();
    const formattedDate = today.toISOString().split('T')[0];
    salesDateInput.value = formattedDate;
    
        // Function to update sales data
    const updateSalesData = async () => {
      try {
        const selectedDate = salesDateInput.value;
        if (selectedDate) {
          // Convert the date to a proper format for the query
          const date = new Date(selectedDate);
          const formattedDate = formatDate(date);
          
          // Update the date input value to ensure consistency
          salesDateInput.value = formattedDate;
          
          // Update the sales data
          await updateTotalSales(formattedDate);
          
          // Also update any related charts or data
          updateSalesChart();
        }
      } catch (error) {
        console.error('Error updating sales data:', error);
        showNotification('Failed to update sales data. Please try again.', 'error');
      }
    };
    
    // Update sales when update button is clicked
    updateSalesBtn.addEventListener('click', updateSalesData);
    
    // Also update when Enter is pressed in the date input or when the date changes
    salesDateInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        updateSalesData();
      }
    });
    
    // Also update when the date changes
    salesDateInput.addEventListener('change', updateSalesData);
    
    // Initial load with today's sales
    updateSalesData();
  }
  
  // Initialize dashboard data with today's sales
  updateTotalSales(formatDate(new Date()));
  updateTodaysSales();
  
  // Add event listeners for log filters when logs section is shown
  const logsSection = document.querySelector('[data-section="logs"]');
  if (logsSection) {
    const logProductFilter = document.getElementById('logProductFilter');
    const logType = document.getElementById('logType');
    const logFrom = document.getElementById('logFrom');
    const logTo = document.getElementById('logTo');
    
    if (logProductFilter && logType && logFrom && logTo) {
      // Add input event listeners for text and date inputs
      [logProductFilter, logFrom, logTo].forEach(input => {
        input.addEventListener('input', applyLogFilters);
      });
      
      // Add change event listener for select dropdown
      logType.addEventListener('change', applyLogFilters);
    }
  }
  
  // Add click handler for dashboard section
  const dashboardSection = document.querySelector('[data-section="dashboard"]');
  if (dashboardSection) {
    dashboardSection.addEventListener('click', () => {
      const selectedDate = document.getElementById('salesDate')?.value;
      updateTotalSales(selectedDate);
      updateTodaysSales();
      updateStockMovementToday();
    });
  }
  
  // Existing filter code...
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
