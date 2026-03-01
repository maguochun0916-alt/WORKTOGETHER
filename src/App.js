import React, { useState, useEffect, useMemo } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  query,
  addDoc,
  serverTimestamp,
  deleteDoc,
} from "firebase/firestore";
import {
  Home,
  ClipboardList,
  CheckCircle,
  PlusCircle,
  ArrowRightLeft,
  TrendingUp,
  History,
  LogOut,
  X,
  MessageSquare,
  User, // 💡 補上這個缺漏的人物圖示，就不會再閃退了！
} from "lucide-react";

// ==========================================
// 🚀 快速設定區
// ==========================================
const SITE_NAME = "甲股勤務支援中心";

const firebaseConfig = {
  apiKey: "AIzaSyAR1GzSueTAQvTTA0LfIYLfuOn9bBtrVDI",
  authDomain: "yilan-99e2b.firebaseapp.com",
  projectId: "yilan-99e2b",
  storageBucket: "yilan-99e2b.firebasestorage.app",
  messagingSenderId: "971422172769",
  appId: "1:971422172769:web:718c4a2aa464d7b10b4c20",
};

const PROJECT_ID = "squad-a-duty-support";

const ROSTER = {
  A: [
    "蘇原德", "俞錦昌", "陳凱揚", "黃巍", "林正倫", "陳冠銘", "劉家銘",
    "林政彥", "游子達", "廖國鈞", "陳昭閔", "游翼誠", "馬國郡", "杜岡儒",
    "陳建安", "梁辰宇", "劉政鍾", "洪琮棋", "陳俊宏", "林宏昌", "徐裕凱",
  ],
  B: [
    "蔡睿宇", "林振昌", "林政毅", "陳宏裕", "黃世賢", "林義益", "程冠諺",
    "吳錫隆", "劉峻宏", "李錫榮", "廖於凱", "賴勛皓", "郭子逢", "黃保鳴",
    "阮俊傑", "陸明道", "陳駿毅", "高唯哲", "張哲瑋", "黃嘉政", "鄭佶文",
  ],
  C: [
    "林泰伯", "財俊明", "賴洪國", "林鍵傑", "林志昂", "陳家宏", "江哲",
    "莊立揚", "許育維", "廖家郁", "方子彥", "詹文愷", "馮國欽", "李岳峰",
    "戴煜恩", "吳有佳", "林仲華", "王聖宏", "陳慶瑜", "林維慶", "林嘉祥",
  ],
};

const isWorkingDay = (dateStr, group) => {
  const target = new Date(dateStr + "T00:00:00");
  const base = new Date("2026-02-01T00:00:00");
  const diffDays = Math.round((target.getTime() - base.getTime()) / (1000 * 60 * 60 * 24));
  const dayIdx = ((diffDays % 6) + 6) % 6;
  if (dayIdx === 1 || dayIdx === 3 || dayIdx === 5) return false;
  if (dayIdx === 0) return group === "A" || group === "B";
  if (dayIdx === 2) return group === "B" || group === "C";
  if (dayIdx === 4) return group === "C" || group === "A";
  return false;
};

// ==========================================
// ⚙️ 系統核心邏輯
// ==========================================
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const SHIFT_TYPES = {
  FULL: { label: "日夜", cost: 2 },
  DAY: { label: "日班", cost: 1 },
  NIGHT: { label: "夜班", cost: 1 },
};

const MEMBER_TO_GROUP = {};
Object.entries(ROSTER).forEach(([group, names]) => {
  names.forEach((name) => (MEMBER_TO_GROUP[name] = group));
});

const getPointsStatusText = (points) => {
  if (points === null || points === undefined) return "-";
  if (points >= 2) return "當月未加過班";
  if (points === 1) return "當月已加過半天班";
  if (points === 0) return "當月已加過日夜or兩次半天班";
  return "請注意加班時數超額";
};

export default function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [activeName, setActiveName] = useState(null);
  const [orders, setOrders] = useState([]);
  const [activeTab, setActiveTab] = useState("home");
  const [showLogin, setShowLogin] = useState(true);
  const [showPostModal, setShowPostModal] = useState(false);
  const [modalType, setModalType] = useState("red");
  const [msg, setMsg] = useState(null);
  const [loginGroup, setLoginGroup] = useState("A");
  
  // 表單狀態
  const [postDate, setPostDate] = useState("");
  const [postShift, setPostShift] = useState("FULL");
  const [postReason, setPostReason] = useState("");
  const [postAmount, setPostAmount] = useState("1000");

  const isAdmin = userData?.name === "馬國郡";

  useEffect(() => {
    document.title = "勤務支援";
    signInAnonymously(auth).catch(console.error);
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user || !activeName) {
      setShowLogin(true);
      return;
    }
    const q = query(collection(db, "artifacts", PROJECT_ID, "public", "data", "orders"));
    const unsubOrders = onSnapshot(q, (s) =>
      setOrders(s.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubUser = onSnapshot(
      doc(db, "artifacts", PROJECT_ID, "public", "data", "users", activeName),
      (d) => {
        if (d.exists()) {
          setUserData(d.data());
          setShowLogin(false);
        } else {
          setShowLogin(true);
        }
      }
    );
    return () => {
      unsubOrders();
      unsubUser();
    };
  }, [user, activeName]);

  const showToast = (text, type = "info") => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 3000);
  };

  const handleLogin = async (name) => {
    const group = MEMBER_TO_GROUP[name];
    const ref = doc(db, "artifacts", PROJECT_ID, "public", "data", "users", name);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, { name, group, points: 2, uid: name });
    }
    setActiveName(name);
    setShowLogin(false);
  };

  const postOrder = async (formData) => {
    const { date, shiftType, type, reason, amount } = formData;
    if (orders.some((o) => o.creatorId === userData.name && o.date === date && o.type === type && o.status === "open")) {
      showToast("❌ 已發布過相同需求！", "error");
      return;
    }
    const isWorking = isWorkingDay(date, userData.group);
    if (type === "red" && !isWorking) {
      showToast("❌ 您當天原本就是休假！", "error");
      return;
    }
    if (type === "green" && isWorking) {
      showToast("❌ 您當天原本就有勤務！", "error");
      return;
    }

    const finalAmount = amount === "" ? 1000 : Number(amount);

    await addDoc(collection(db, "artifacts", PROJECT_ID, "public", "data", "orders"), {
      creatorId: userData.name,
      creatorName: userData.name,
      creatorGroup: userData.group,
      date,
      shiftType,
      type,
      reason,
      amount: finalAmount,
      status: "open",
      createdAt: serverTimestamp(),
    });
    setShowPostModal(false);
    showToast("✅ 發布成功！", "success");
  };

  const handleMatch = async (order) => {
    const cost = SHIFT_TYPES[order.shiftType]?.cost || 2;
    const workerId = order.type === "red" ? userData.name : order.creatorId;
    const workerRef = doc(db, "artifacts", PROJECT_ID, "public", "data", "users", workerId);
    const workerData = (await getDoc(workerRef)).data();

    if (isWorkingDay(order.date, userData.name === workerId ? userData.group : order.creatorGroup)) {
      showToast("🚫 勤務配對衝突！", "error");
      return;
    }

    const newPoints = workerData.points - cost;

    await updateDoc(doc(db, "artifacts", PROJECT_ID, "public", "data", "orders", order.id), {
      status: "matched",
      workerId: userData.name,
      workerName: userData.name,
      matchedAt: serverTimestamp(),
    });

    await updateDoc(workerRef, { points: newPoints });

    if (newPoints < 0) showToast("🤝 配對成功！(提醒：加班時數已超額)", "success");
    else showToast("🤝 配對成功！", "success");

    setActiveTab("completed");
  };

  const deleteOrder = async (id) => {
    if (!window.confirm("確定要刪除這筆紀錄嗎？")) return;
    await deleteDoc(doc(db, "artifacts", PROJECT_ID, "public", "data", "orders", id));
    showToast("🗑️ 已移除紀錄");
  };

  const editOrderAmount = async (order) => {
    const currentAmt = order.amount !== undefined ? order.amount : 1000;
    const newAmt = window.prompt("請輸入新的金額：", currentAmt);
    if (newAmt !== null && newAmt.trim() !== "" && !isNaN(newAmt)) {
      await updateDoc(doc(db, "artifacts", PROJECT_ID, "public", "data", "orders", order.id), { 
        amount: Number(newAmt) 
      });
      showToast("💰 金額已更新", "success");
    }
  };

  const renderHome = () => {
    const openOrders = orders
      .filter((o) => o.status === "open")
      .sort((a, b) => new Date(a.date) - new Date(b.date));
      
    return (
      <div className="p-4 sm:p-6 space-y-6 pb-24">
        {/* 高質感個人狀態卡片 */}
        <div className="bg-gradient-to-br from-slate-800 via-slate-800 to-slate-900 rounded-[2rem] p-7 text-white shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
          <div className="relative z-10">
            <div className="flex justify-between items-center mb-6">
              <span className="bg-white/10 px-3 py-1.5 rounded-full text-xs font-bold tracking-wider backdrop-blur-sm border border-white/5">
                {userData?.group}股
              </span>
              <span className="font-bold tracking-widest opacity-80">{userData?.name}</span>
            </div>
            <p className="text-xs text-blue-200 font-bold mb-1 tracking-wider uppercase">本月排班狀態</p>
            <h2 className={`text-2xl sm:text-3xl font-black tracking-wide leading-tight ${userData?.points < 0 ? "text-red-400" : "text-white"}`}>
              {getPointsStatusText(userData?.points)}
            </h2>
            <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
              <span className="text-sm opacity-50 font-medium">目前剩餘點數</span>
              <span className="text-xl font-black">{userData?.points ?? 0}</span>
            </div>
          </div>
          <TrendingUp size={100} className="absolute -right-6 -bottom-6 opacity-5 pointer-events-none" />
        </div>

        {/* 雙色發布按鈕 */}
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => {
              setModalType("red");
              setPostDate(""); setPostReason(""); setPostAmount("1000");
              setShowPostModal(true);
            }}
            className="bg-rose-50 hover:bg-rose-100 p-5 rounded-[2rem] shadow-sm border border-rose-100 text-rose-600 flex flex-col items-center justify-center gap-3 active:scale-[0.98] touch-manipulation transition-all"
          >
            <div className="bg-white p-3 rounded-full shadow-sm">
              <PlusCircle size={28} strokeWidth={2.5} />
            </div>
            <span className="font-black tracking-wide">發布休假</span>
          </button>
          <button
            onClick={() => {
              setModalType("green");
              setPostDate(""); setPostReason(""); setPostAmount("1000");
              setShowPostModal(true);
            }}
            className="bg-emerald-50 hover:bg-emerald-100 p-5 rounded-[2rem] shadow-sm border border-emerald-100 text-emerald-600 flex flex-col items-center justify-center gap-3 active:scale-[0.98] touch-manipulation transition-all"
          >
            <div className="bg-white p-3 rounded-full shadow-sm">
              <PlusCircle size={28} strokeWidth={2.5} />
            </div>
            <span className="font-black tracking-wide">發布加班</span>
          </button>
        </div>

        {/* 佈告欄列表 */}
        <div>
          <h2 className="text-lg font-black mb-4 flex items-center gap-2 text-slate-800 tracking-wide px-1">
            <ClipboardList size={22} className="text-blue-500"/> 需求佈告欄 <span className="text-sm font-bold text-slate-400 ml-1">({openOrders.length})</span>
          </h2>
          <div className="space-y-4">
            {openOrders.length === 0 ? (
              <div className="text-center py-10 bg-white rounded-3xl border border-dashed border-slate-200">
                <p className="text-slate-400 font-bold">目前沒有任何需求</p>
              </div>
            ) : (
              openOrders.map((order) => {
                const displayAmt = order.amount !== undefined ? order.amount : 1000;
                const isOwn = userData?.name === order.creatorId;
                const canManage = isOwn || isAdmin;

                return (
                  <div key={order.id} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden flex flex-col">
                    <div className={`absolute top-0 left-0 right-0 h-1.5 ${order.type === "red" ? "bg-rose-500" : "bg-emerald-500"}`} />
                    <div className="flex justify-between items-start mt-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`text-[10px] px-2 py-0.5 rounded-md font-black tracking-widest ${order.type === "red" ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-700"}`}>
                            {order.type === "red" ? "求代班" : "求休假"}
                          </span>
                          <span className="text-sm font-bold text-slate-500">{SHIFT_TYPES[order.shiftType].label}</span>
                        </div>
                        <p className="font-black text-2xl text-slate-800 mb-1">
                          {new Date(order.date).toLocaleDateString("zh-TW", { month: "short", day: "numeric", weekday: "short" })}
                        </p>
                        <p className="text-sm font-bold text-slate-500 flex items-center gap-1.5">
                          <User size={14} /> {order.creatorName}
                        </p>
                        {order.reason && (
                          <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-2 bg-slate-50 p-2 rounded-xl border border-slate-100 font-medium">
                            <MessageSquare size={12} className="text-slate-400"/> {order.reason}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-3">
                        {canManage && (
                          <button onClick={() => deleteOrder(order.id)} className="p-2 -mt-1 -mr-1 text-slate-300 hover:text-rose-500 active:scale-90 transition-all bg-slate-50 hover:bg-rose-50 rounded-full">
                            <X size={16} />
                          </button>
                        )}
                        <button
                          onClick={() => canManage && editOrderAmount(order)}
                          className={`text-lg font-black tracking-tight ${canManage ? "active:scale-95 hover:text-blue-600 text-slate-800" : "text-slate-800"}`}
                        >
                          💰 {displayAmt}
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={() => handleMatch(order)}
                      className={`w-full mt-5 py-3.5 rounded-2xl text-sm font-black tracking-widest transition-all active:scale-[0.98] shadow-sm ${
                        isOwn ? "bg-slate-100 text-slate-400 cursor-not-allowed" : "bg-slate-800 text-white hover:bg-slate-700"
                      }`}
                      disabled={isOwn}
                    >
                      {isOwn ? "等待配對中..." : "幫這個忙"}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderCompleted = () => {
    const matched = orders
      .filter((o) => o.status === "matched")
      .sort((a, b) => (b.matchedAt?.seconds || 0) - (a.matchedAt?.seconds || 0));
      
    return (
      <div className="p-4 sm:p-6 pb-24 space-y-5">
        <h2 className="text-lg font-black flex items-center gap-2 text-slate-800 tracking-wide px-1 mb-2">
          <History size={22} className="text-indigo-500" /> 換班完成紀錄
        </h2>
        {matched.length === 0 && (
           <div className="text-center py-10 bg-white rounded-3xl border border-dashed border-slate-200">
             <p className="text-slate-400 font-bold">目前沒有換班紀錄</p>
           </div>
        )}
        {matched.map((order) => {
          const displayAmt = order.amount !== undefined ? order.amount : 1000;
          const canManage = userData?.name === order.creatorId || userData?.name === order.workerId || isAdmin;

          return (
            <div key={order.id} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm relative">
              <div className="flex justify-between items-center mb-5">
                <span className="text-[10px] bg-indigo-50 text-indigo-600 border border-indigo-100 px-3 py-1 rounded-full font-black tracking-widest">
                  配對成功
                </span>
                {canManage && (
                  <button onClick={() => deleteOrder(order.id)} className="p-1.5 -mr-1.5 text-slate-300 hover:text-rose-500 active:scale-90 transition-all rounded-full">
                    <X size={18} />
                  </button>
                )}
              </div>
              
              <div className="flex items-center justify-between text-center bg-slate-50 p-4 rounded-2xl border border-slate-100/50">
                <div className="flex-1">
                  <p className="text-[11px] text-slate-400 font-bold tracking-widest mb-1">休假方</p>
                  <p className="font-black text-slate-800 text-lg">{order.type === "red" ? order.creatorName : order.workerName}</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center shrink-0 border border-slate-100 mx-2 z-10">
                  <ArrowRightLeft className="text-slate-300" size={14} />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] text-slate-400 font-bold tracking-widest mb-1">上班方</p>
                  <p className="font-black text-blue-600 text-lg">{order.type === "red" ? order.workerName : order.creatorName}</p>
                </div>
              </div>
              
              <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-end">
                <div>
                  <p className="font-black text-slate-800">{order.date}</p>
                  <p className="text-xs font-bold text-slate-400 mt-0.5">{SHIFT_TYPES[order.shiftType].label}</p>
                </div>
                <span className="font-black text-slate-800 text-lg tracking-tight">💰 {displayAmt}</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] max-w-md mx-auto relative font-sans overflow-x-hidden selection:bg-blue-100">
      <style>{`
        /* 隱藏原生滾動條，讓整體看起來更像 App */
        ::-webkit-scrollbar { display: none; }
        html { -ms-overflow-style: none; scrollbar-width: none; scroll-behavior: smooth; }
      `}</style>

      {/* 提示訊息 */}
      {msg && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-3.5 rounded-full text-white text-sm font-bold shadow-lg animate-in fade-in slide-in-from-top-4 flex items-center gap-2 ${
            msg.type === "error" ? "bg-rose-600" : msg.type === "warning" ? "bg-amber-500" : "bg-slate-800"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* 登入畫面 */}
      {showLogin && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-5">
          <div className="bg-white w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-[2.5rem] p-7 sm:p-8 space-y-7 shadow-2xl animate-in zoom-in-95">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm border border-blue-100">
                <ShieldCheck size={32} />
              </div>
              <h1 className="text-2xl font-black text-slate-800 tracking-wide">{SITE_NAME}</h1>
              <p className="text-sm font-bold text-slate-400">請選擇您的股別與姓名</p>
            </div>
            
            <div className="flex bg-slate-50 p-1.5 rounded-[1.25rem] border border-slate-100">
              {["A", "B", "C"].map((g) => (
                <button
                  key={g}
                  onClick={() => setLoginGroup(g)}
                  className={`flex-1 py-3 text-sm font-black rounded-xl transition-all touch-manipulation ${
                    loginGroup === g ? "bg-white shadow-sm border border-slate-200/60 text-blue-600" : "text-slate-400"
                  }`}
                >
                  {g}股
                </button>
              ))}
            </div>
            <div className="max-h-[40vh] overflow-y-auto grid grid-cols-2 gap-3 pr-1 pb-2">
              {ROSTER[loginGroup].map((n) => (
                <button
                  key={n}
                  onClick={() => handleLogin(n)}
                  className="p-3.5 border border-slate-200 bg-white rounded-2xl font-black text-slate-700 hover:border-blue-300 active:bg-blue-50 active:scale-95 transition-all touch-manipulation"
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 發布單 Modal */}
      {showPostModal && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-end justify-center">
          <div className="bg-white w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-[2.5rem] p-7 pb-[calc(env(safe-area-inset-bottom)+2rem)] animate-in slide-in-from-bottom-full shadow-[0_-10px_40px_rgba(0,0,0,0.15)]">
            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6"></div>
            <h2 className="text-2xl font-black mb-6 text-slate-800 tracking-wide flex items-center gap-2">
              {modalType === "red" ? <><span className="w-3 h-3 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]"></span> 發布休假單</> : <><span className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"></span> 發布加班單</>}
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                postOrder({ date: postDate, shiftType: postShift, type: modalType, reason: postReason, amount: postAmount });
              }}
              className="space-y-5"
            >
              <div>
                <label className="text-xs font-bold text-slate-500 ml-1 mb-2 block tracking-wider">選擇日期</label>
                <input required type="date" value={postDate} onChange={(e) => setPostDate(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-slate-700" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 ml-1 mb-2 block tracking-wider">選擇班別</label>
                <select value={postShift} onChange={(e) => setPostShift(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none appearance-none text-slate-700">
                  <option value="FULL">日夜</option>
                  <option value="DAY">日班</option>
                  <option value="NIGHT">夜班</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 ml-1 mb-2 block tracking-wider">金額配置 (預設1000)</label>
                <div className="flex gap-2 mb-3">
                  {["0", "500", "1000", "1500"].map((amt) => (
                    <button
                      type="button"
                      key={amt}
                      onClick={() => setPostAmount(amt)}
                      className={`flex-1 py-3 text-sm font-black rounded-xl border transition-all touch-manipulation active:scale-[0.98] ${
                        postAmount === String(amt) ? "bg-slate-800 border-slate-800 text-white shadow-md" : "bg-white border-slate-200 text-slate-500"
                      }`}
                    >
                      {amt}
                    </button>
                  ))}
                </div>
                <input type="number" placeholder="或手動輸入其他金額..." value={postAmount} onChange={(e) => setPostAmount(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-slate-700" />
              </div>

              <div>
                <div className="flex justify-between items-center ml-1 mb-2 mt-2">
                  <label className="text-xs font-bold text-slate-500 tracking-wider">備註原因 (非必填)</label>
                  <span className={`text-[10px] font-bold ${postReason.length >= 10 ? "text-rose-500" : "text-slate-400"}`}>{postReason.length}/10</span>
                </div>
                <input type="text" placeholder="例如：要出國、看醫生..." maxLength="10" value={postReason} onChange={(e) => setPostReason(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-slate-700" />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowPostModal(false)} className="flex-1 p-4 font-black text-slate-500 bg-slate-100 rounded-2xl active:scale-95 touch-manipulation transition-all">
                  取消
                </button>
                <button type="submit" className={`flex-1 p-4 rounded-2xl font-black text-white shadow-lg active:scale-95 touch-manipulation transition-all ${modalType === "red" ? "bg-rose-600 shadow-rose-600/30" : "bg-emerald-600 shadow-emerald-600/30"}`}>
                  確認發布
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 頂部標題列 */}
      <header className="sticky top-0 bg-white/80 backdrop-blur-xl p-5 flex justify-between items-center z-40 border-b border-slate-100">
        <h1 className="font-black text-slate-800 tracking-widest text-lg">{SITE_NAME}</h1>
        <button onClick={() => { setActiveName(null); setShowLogin(true); }} className="p-2 bg-slate-50 text-slate-400 rounded-full hover:text-slate-700 active:scale-90 transition-all border border-slate-100">
          <LogOut size={16} strokeWidth={2.5}/>
        </button>
      </header>

      {/* 內容區 */}
      <main className="relative z-10">
        {activeTab === "home" ? renderHome() : renderCompleted()}
      </main>

      {/* 底部懸浮毛玻璃選單 */}
      <nav className="fixed bottom-0 w-full max-w-md bg-white/80 backdrop-blur-xl border-t border-slate-200/50 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] px-2 flex justify-around items-center z-40 shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.05)]">
        <button onClick={() => setActiveTab("home")} className={`flex-1 py-2 flex flex-col items-center transition-all touch-manipulation active:scale-[0.98] ${activeTab === "home" ? "text-blue-600" : "text-slate-400"}`}>
          <div className={`p-1.5 rounded-xl mb-0.5 ${activeTab === "home" ? "bg-blue-50" : "bg-transparent"}`}>
             <Home size={22} strokeWidth={activeTab === "home" ? 2.5 : 2} />
          </div>
          <span className="text-[10px] font-black tracking-widest">佈告欄</span>
        </button>
        <button onClick={() => setActiveTab("completed")} className={`flex-1 py-2 flex flex-col items-center transition-all touch-manipulation active:scale-[0.98] ${activeTab === "completed" ? "text-blue-600" : "text-slate-400"}`}>
          <div className={`p-1.5 rounded-xl mb-0.5 ${activeTab === "completed" ? "bg-blue-50" : "bg-transparent"}`}>
             <CheckCircle size={22} strokeWidth={activeTab === "completed" ? 2.5 : 2} />
          </div>
          <span className="text-[10px] font-black tracking-widest">完成區</span>
        </button>
      </nav>
    </div>
  );
}

// 供圖示使用的簡易小元件
function ShieldCheck({ size = 24, ...props }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}