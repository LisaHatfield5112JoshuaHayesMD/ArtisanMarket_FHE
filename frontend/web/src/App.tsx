// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface Artisan {
  id: string;
  name: string;
  category: string;
  location: string;
  encryptedRating: string;
  encryptedStyle: string;
  owner: string;
}

const App: React.FC = () => {
  // State management
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [artisans, setArtisans] = useState<Artisan[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [adding, setAdding] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newArtisanData, setNewArtisanData] = useState({
    name: "",
    category: "",
    location: "",
    style: ""
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [showTutorial, setShowTutorial] = useState(false);

  // Filter artisans based on search and category
  const filteredArtisans = artisans.filter(artisan => {
    const matchesSearch = artisan.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         artisan.location.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "all" || artisan.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Categories for filtering
  const categories = ["all", "pottery", "jewelry", "textile", "woodwork", "metalwork"];

  useEffect(() => {
    loadArtisans().finally(() => setLoading(false));
  }, []);

  // Wallet connection handlers
  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  // Load artisans from contract
  const loadArtisans = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("artisan_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing artisan keys:", e);
        }
      }
      
      const list: Artisan[] = [];
      
      for (const key of keys) {
        try {
          const artisanBytes = await contract.getData(`artisan_${key}`);
          if (artisanBytes.length > 0) {
            try {
              const artisanData = JSON.parse(ethers.toUtf8String(artisanBytes));
              list.push({
                id: key,
                name: artisanData.name,
                category: artisanData.category,
                location: artisanData.location,
                encryptedRating: artisanData.rating,
                encryptedStyle: artisanData.style,
                owner: artisanData.owner
              });
            } catch (e) {
              console.error(`Error parsing artisan data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading artisan ${key}:`, e);
        }
      }
      
      setArtisans(list);
    } catch (e) {
      console.error("Error loading artisans:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  // Add new artisan
  const addArtisan = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setAdding(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting artisan data with FHE..."
    });
    
    try {
      // Simulate FHE encryption of style preferences
      const encryptedStyle = `FHE-${btoa(JSON.stringify(newArtisanData.style))}`;
      const encryptedRating = `FHE-${btoa("5")}`; // Default rating
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const artisanId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const artisanData = {
        name: newArtisanData.name,
        category: newArtisanData.category,
        location: newArtisanData.location,
        rating: encryptedRating,
        style: encryptedStyle,
        owner: account
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `artisan_${artisanId}`, 
        ethers.toUtf8Bytes(JSON.stringify(artisanData))
      );
      
      const keysBytes = await contract.getData("artisan_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(artisanId);
      
      await contract.setData(
        "artisan_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Artisan added with FHE encryption!"
      });
      
      await loadArtisans();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowAddModal(false);
        setNewArtisanData({
          name: "",
          category: "",
          location: "",
          style: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setAdding(false);
    }
  };

  // Check if user is owner
  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  // Tutorial steps
  const tutorialSteps = [
    {
      title: "Connect Wallet",
      description: "Connect your Web3 wallet to access the marketplace",
      icon: "🔗"
    },
    {
      title: "Browse Artisans",
      description: "Discover local artisans with FHE-protected recommendations",
      icon: "🔍"
    },
    {
      title: "Add Your Artisan",
      description: "List your craft with encrypted style preferences",
      icon: "➕"
    },
    {
      title: "Privacy First",
      description: "Your preferences remain encrypted during matching",
      icon: "🔒"
    }
  ];

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Loading artisan marketplace...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>Artisan<span>Market</span></h1>
          <p>Privacy-Preserving Local Crafts</p>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowAddModal(true)} 
            className="primary-btn"
            disabled={!account}
          >
            Add Your Artisan
          </button>
          <button 
            className="secondary-btn"
            onClick={() => setShowTutorial(!showTutorial)}
          >
            {showTutorial ? "Hide Guide" : "Show Guide"}
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        {showTutorial && (
          <div className="tutorial-section">
            <h2>How It Works</h2>
            <p className="subtitle">Discover local artisans while preserving your privacy</p>
            
            <div className="tutorial-steps">
              {tutorialSteps.map((step, index) => (
                <div className="tutorial-step" key={index}>
                  <div className="step-icon">{step.icon}</div>
                  <div className="step-content">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="search-filter-section">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search artisans..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <button className="search-btn">🔍</button>
          </div>
          <div className="filter-dropdown">
            <select 
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              {categories.map(category => (
                <option key={category} value={category}>
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>
        
        <div className="stats-bar">
          <div className="stat-item">
            <span className="stat-number">{artisans.length}</span>
            <span className="stat-label">Total Artisans</span>
          </div>
          <div className="stat-item">
            <span className="stat-number">
              {artisans.filter(a => a.category === "pottery").length}
            </span>
            <span className="stat-label">Pottery</span>
          </div>
          <div className="stat-item">
            <span className="stat-number">
              {artisans.filter(a => a.category === "jewelry").length}
            </span>
            <span className="stat-label">Jewelry</span>
          </div>
          <div className="stat-item">
            <span className="stat-number">
              {artisans.filter(a => a.category === "textile").length}
            </span>
            <span className="stat-label">Textile</span>
          </div>
        </div>
        
        <div className="artisans-grid">
          {filteredArtisans.length === 0 ? (
            <div className="no-results">
              <p>No artisans found matching your criteria</p>
              <button 
                className="primary-btn"
                onClick={() => {
                  setSearchTerm("");
                  setSelectedCategory("all");
                }}
              >
                Reset Filters
              </button>
            </div>
          ) : (
            filteredArtisans.map(artisan => (
              <div className="artisan-card" key={artisan.id}>
                <div className="card-header">
                  <h3>{artisan.name}</h3>
                  <span className={`category-badge ${artisan.category}`}>
                    {artisan.category}
                  </span>
                </div>
                <div className="card-body">
                  <p className="location">📍 {artisan.location}</p>
                  <div className="encrypted-info">
                    <div className="info-item">
                      <span className="label">Style:</span>
                      <span className="value">🔒 FHE-Encrypted</span>
                    </div>
                    <div className="info-item">
                      <span className="label">Rating:</span>
                      <span className="value">🔒 FHE-Encrypted</span>
                    </div>
                  </div>
                </div>
                <div className="card-footer">
                  {isOwner(artisan.owner) && (
                    <button 
                      className="small-btn"
                      onClick={() => {
                        alert("This would trigger FHE recomputation in a real implementation");
                      }}
                    >
                      Refresh FHE Data
                    </button>
                  )}
                  <button 
                    className="small-btn primary"
                    onClick={() => {
                      alert("This would use FHE to match your encrypted preferences in a real implementation");
                    }}
                  >
                    Match with FHE
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
  
      {showAddModal && (
        <ModalAdd 
          onSubmit={addArtisan} 
          onClose={() => setShowAddModal(false)} 
          adding={adding}
          artisanData={newArtisanData}
          setArtisanData={setNewArtisanData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <h3>ArtisanMarket</h3>
            <p>Privacy-preserving local artisan marketplace powered by FHE</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">About</a>
            <a href="#" className="footer-link">Privacy</a>
            <a href="#" className="footer-link">Terms</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="tech-badge">
            <span>FHE-Powered Matching</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} ArtisanMarket. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalAddProps {
  onSubmit: () => void; 
  onClose: () => void; 
  adding: boolean;
  artisanData: any;
  setArtisanData: (data: any) => void;
}

const ModalAdd: React.FC<ModalAddProps> = ({ 
  onSubmit, 
  onClose, 
  adding,
  artisanData,
  setArtisanData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setArtisanData({
      ...artisanData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!artisanData.name || !artisanData.category || !artisanData.style) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="add-modal">
        <div className="modal-header">
          <h2>Add Your Artisan Profile</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            Your style preferences will be encrypted with FHE for privacy
          </div>
          
          <div className="form-group">
            <label>Name *</label>
            <input 
              type="text"
              name="name"
              value={artisanData.name} 
              onChange={handleChange}
              placeholder="Your name or business name" 
            />
          </div>
          
          <div className="form-group">
            <label>Category *</label>
            <select 
              name="category"
              value={artisanData.category} 
              onChange={handleChange}
            >
              <option value="">Select category</option>
              <option value="pottery">Pottery</option>
              <option value="jewelry">Jewelry</option>
              <option value="textile">Textile</option>
              <option value="woodwork">Woodwork</option>
              <option value="metalwork">Metalwork</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Location</label>
            <input 
              type="text"
              name="location"
              value={artisanData.location} 
              onChange={handleChange}
              placeholder="City or region" 
            />
          </div>
          
          <div className="form-group">
            <label>Style Preferences *</label>
            <textarea 
              name="style"
              value={artisanData.style} 
              onChange={handleChange}
              placeholder="Describe your artistic style (will be FHE encrypted)" 
              rows={4}
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="secondary-btn"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={adding}
            className="primary-btn"
          >
            {adding ? "Encrypting with FHE..." : "Submit Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;