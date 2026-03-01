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
    "蘇原德",
    "俞錦昌",
    "陳凱揚",
    "黃巍",
    "林正倫",
    "陳冠銘",
    "劉家銘",
    "林政彥",
    "游子逵",
    "廖國鈞",
    "陳昭閔",
    "游翼誠",
    "馬國郡",
    "杜岡儒",
    "陳建安",
    "梁辰宇",
    "劉政鍾",
    "洪琮棋",
    "陳俊宏",
    "林宏昌",
    "徐裕凱",
    "楊淵文",
  ],
  B: [
    "蔡睿宇",
    "林振昌",
    "林政毅",
    "陳宏裕",
    "黃世賢",
    "林義益",
    "程冠諺",
    "吳錫隆",
    "劉峻宏",
    "李錫榮",
    "廖於凱",
    "賴勛皓",
    "郭子逢",
    "黃保鳴",
    "阮俊傑",
    "陸明道",
    "陳駿毅",
    "高唯哲",
    "張哲瑋",
    "黃嘉政",
    "鄭佶文",
  ],
  C: [
    "林泰伯",
    "財俊明",
    "賴洪國",
    "林鍵傑",
    "林志昂",
    "陳家宏",
    "江哲",
    "莊立揚",
    "許育維",
    "廖家郁",
    "方子彥",
    "詹文愷",
    "馮國欽",
    "李岳峰",
    "戴煜恩",
    "吳有佳",
    "林仲華",
    "王聖宏",
    "陳慶瑜",
    "林維慶",
    "林嘉祥",
  ],
};

const isWorkingDay = (dateStr, group) => {
  const target = new Date(dateStr + "T00:00:00");
  const base = new Date("2026-02-01T00:00:00");
  const diffDays = Math.round(
    (target.getTime() - base.getTime()) / (1000 * 60 * 60 * 24)
  );
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
  const [postDate, setPostDate] = useState("");
  const [postShift, setPostShift] = useState("FULL");
  const [postReason, setPostReason] = useState("");
  const [postAmount, setPostAmount] = useState("1000");

  const isAdmin = userData?.name === "馬國郡";

  useEffect(() => {
    document.title = "勤務支援";

    // 雖然改用物理防禦，但隱藏語法還是留著以防萬一
    try {
      if (window.top !== window.self) {
        window.top.location = window.self.location;
      }
    } catch (e) {}

    signInAnonymously(auth).catch(console.error);
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!activeName) setShowLogin(true);
    });

    return () => unsubscribeAuth();
  }, [activeName]);

  useEffect(() => {
    if (!user || !activeName) return;
    const q = query(
      collection(db, "artifacts", PROJECT_ID, "public", "data", "orders")
    );
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

  const openOrders = useMemo(() => {
    return orders
      .filter((o) => o.status === "open")
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [orders]);

  const matchedOrders = useMemo(() => {
    return orders
      .filter((o) => o.status === "matched")
      .sort(
        (a, b) => (b.matchedAt?.seconds || 0) - (a.matchedAt?.seconds || 0)
      );
  }, [orders]);

  const showToast = (text, type = "info") => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 3000);
  };

  const handleLogin = async (name) => {
    const group = MEMBER_TO_GROUP[name];
    const ref = doc(
      db,
      "artifacts",
      PROJECT_ID,
      "public",
      "data",
      "users",
      name
    );
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, { name, group, points: 2, uid: name });
    }
    setActiveName(name);
    setShowLogin(false);
  };

  const postOrder = async (formData) => {
    const { date, shiftType, type, reason, amount } = formData;
    if (
      orders.some(
        (o) =>
          o.creatorId === userData.name &&
          o.date === date &&
          o.type === type &&
          o.status === "open"
      )
    ) {
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

    await addDoc(
      collection(db, "artifacts", PROJECT_ID, "public", "data", "orders"),
      {
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
      }
    );
    setShowPostModal(false);
    showToast("✅ 發布成功！", "success");
  };

  const handleMatch = async (order) => {
    const cost = SHIFT_TYPES[order.shiftType]?.cost || 2;
    const workerId = order.type === "red" ? userData.name : order.creatorId;
    const workerRef = doc(
      db,
      "artifacts",
      PROJECT_ID,
      "public",
      "data",
      "users",
      workerId
    );
    const workerData = (await getDoc(workerRef)).data();

    if (
      isWorkingDay(
        order.date,
        userData.name === workerId ? userData.group : order.creatorGroup
      )
    ) {
      showToast("🚫 勤務配對衝突！", "error");
      return;
    }

    const newPoints = workerData.points - cost;

    await updateDoc(
      doc(db, "artifacts", PROJECT_ID, "public", "data", "orders", order.id),
      {
        status: "matched",
        workerId: userData.name,
        workerName: userData.name,
        matchedAt: serverTimestamp(),
      }
    );

    await updateDoc(workerRef, { points: newPoints });

    if (newPoints < 0) {
      showToast("🤝 配對成功！(提醒：加班時數已超額)", "success");
    } else {
      showToast("🤝 配對成功！", "success");
    }

    setActiveTab("completed");
  };

  const deleteOrder = async (id) => {
    if (!window.confirm("確定要刪除這筆紀錄嗎？")) return;
    await deleteDoc(
      doc(db, "artifacts", PROJECT_ID, "public", "data", "orders", id)
    );
    showToast("🗑️ 已移除紀錄");
  };

  const editOrderAmount = async (order) => {
    const currentAmt = order.amount !== undefined ? order.amount : 1000;
    const newAmt = window.prompt("請輸入新的金額：", currentAmt);
    if (newAmt !== null && newAmt.trim() !== "" && !isNaN(newAmt)) {
      await updateDoc(
        doc(db, "artifacts", PROJECT_ID, "public", "data", "orders", order.id),
        {
          amount: Number(newAmt),
        }
      );
      showToast("💰 金額已更新", "success");
    }
  };

  const renderHome = () => {
    return (
      <div className="p-4 sm:p-6 space-y-6">
        <div className="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
          <p className="opacity-70 text-sm font-medium tracking-wide">
            {userData?.group}組 · {userData?.name}
          </p>
          <div className="mt-4">
            <p className="text-xs opacity-60 mb-1">本月狀態</p>
            <h2
              className={`text-xl sm:text-2xl font-black tracking-wide ${
                userData?.points < 0 ? "text-red-200" : "text-white"
              }`}
            >
              {getPointsStatusText(userData?.points)}
            </h2>
            <p className="text-[10px] opacity-40 mt-1">
              目前點數: {userData?.points ?? 0}
            </p>
          </div>
          <TrendingUp
            size={60}
            className="absolute -right-4 -bottom-2 opacity-10"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => {
              setModalType("red");
              setPostDate("");
              setPostReason("");
              setPostAmount("1000");
              setShowPostModal(true);
            }}
            className="bg-white p-4 min-h-[80px] rounded-2xl shadow-sm border-2 border-red-50 text-red-700 font-bold flex flex-col items-center justify-center gap-2 active:scale-95 touch-manipulation transition-all"
          >
            <PlusCircle size={24} /> <span>我想休假</span>
          </button>
          <button
            onClick={() => {
              setModalType("green");
              setPostDate("");
              setPostReason("");
              setPostAmount("1000");
              setShowPostModal(true);
            }}
            className="bg-white p-4 min-h-[80px] rounded-2xl shadow-sm border-2 border-emerald-50 text-emerald-700 font-bold flex flex-col items-center justify-center gap-2 active:scale-95 touch-manipulation transition-all"
          >
            <PlusCircle size={24} /> <span>我想賺錢</span>
          </button>
        </div>

        <div>
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-800">
            <ClipboardList size={20} /> 佈告欄 ({openOrders.length})
          </h2>
          <div className="space-y-3">
            {openOrders.map((order) => {
              const displayAmt =
                order.amount !== undefined ? order.amount : 1000;
              const isOwn = userData?.name === order.creatorId;
              const canManage = isOwn || isAdmin;

              return (
                <div
                  key={order.id}
                  className="bg-white p-4 rounded-2xl border flex gap-4 shadow-sm relative overflow-hidden"
                >
                  <div
                    className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                      order.type === "red" ? "bg-red-500" : "bg-emerald-500"
                    }`}
                  />
                  <div className="flex-1 pl-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <p
                          className={`text-xs font-black tracking-wider mb-1 ${
                            order.type === "red"
                              ? "text-red-500"
                              : "text-emerald-600"
                          }`}
                        >
                          {order.type === "red" ? "我想休假" : "我想賺錢"}
                        </p>
                        <p className="font-black text-lg text-slate-800">
                          {new Date(order.date).toLocaleDateString("zh-TW", {
                            month: "short",
                            day: "numeric",
                            weekday: "short",
                          })}
                        </p>
                        {order.reason && (
                          <p className="text-xs text-slate-500 flex items-center gap-1 mt-1 font-medium bg-slate-50 p-1.5 rounded-lg inline-flex">
                            <MessageSquare size={12} /> {order.reason}
                          </p>
                        )}
                        <p className="text-sm font-medium text-slate-500 mt-2">
                          {SHIFT_TYPES[order.shiftType].label} ·{" "}
                          <span className="text-slate-700">
                            {order.creatorName}
                          </span>
                        </p>
                        <button
                          onClick={() => canManage && editOrderAmount(order)}
                          className={`mt-2 text-sm font-black text-slate-700 flex items-center gap-1 w-fit px-2 py-1 -ml-2 rounded-lg ${
                            canManage
                              ? "active:scale-95 hover:text-blue-500 active:bg-slate-100 transition-all touch-manipulation"
                              : ""
                          }`}
                        >
                          💰 {displayAmt}
                        </button>
                      </div>
                      {canManage && (
                        <button
                          onClick={() => deleteOrder(order.id)}
                          className="p-2 -mr-2 -mt-2 text-slate-300 hover:text-red-500 active:scale-90 transition-all touch-manipulation rounded-full active:bg-red-50"
                        >
                          <X size={20} />
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => handleMatch(order)}
                      className={`w-full mt-4 py-3 min-h-[44px] rounded-xl text-sm font-black tracking-wide touch-manipulation transition-all active:scale-95 ${
                        isOwn
                          ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                          : "bg-slate-800 text-white shadow-md active:bg-slate-700"
                      }`}
                      disabled={isOwn}
                    >
                      {isOwn ? "等待中..." : "幫這個忙"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 🧱 物理防護：巨大留白區，讓你把清單往上滑到底 */}
        <div className="h-[200px] w-full flex items-end justify-center pb-4 opacity-50"></div>
      </div>
    );
  };

  const renderCompleted = () => {
    return (
      <div className="p-4 sm:p-6 space-y-4">
        <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800">
          <History size={20} /> 換班完成區
        </h2>
        {matchedOrders.map((order) => {
          const displayAmt = order.amount !== undefined ? order.amount : 1000;
          const canManage =
            userData?.name === order.creatorId ||
            userData?.name === order.workerId ||
            isAdmin;

          return (
            <div
              key={order.id}
              className="bg-white p-5 rounded-2xl border shadow-sm relative"
            >
              <div className="flex justify-between items-center mb-4">
                <span className="text-[10px] bg-blue-50 text-blue-600 px-3 py-1 rounded-full font-black tracking-wider">
                  MATCHED
                </span>
                {canManage && (
                  <button
                    onClick={() => deleteOrder(order.id)}
                    className="p-2 -mr-2 -mt-2 text-slate-300 hover:text-red-500 active:scale-90 transition-all touch-manipulation rounded-full"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
              <div className="flex items-center justify-around text-center bg-slate-50 p-3 rounded-xl">
                <div className="flex-1">
                  <p className="text-xs text-slate-400 font-bold mb-1">休假</p>
                  <p className="font-black text-slate-700">
                    {order.type === "red"
                      ? order.creatorName
                      : order.workerName}
                  </p>
                </div>
                <ArrowRightLeft className="text-slate-300 px-2" size={32} />
                <div className="flex-1">
                  <p className="text-xs text-slate-400 font-bold mb-1">加班</p>
                  <p className="font-black text-blue-600">
                    {order.type === "red"
                      ? order.workerName
                      : order.creatorName}
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t text-xs text-slate-500 flex justify-between items-center font-medium">
                <span>
                  {order.date} · {SHIFT_TYPES[order.shiftType].label}
                </span>
                <span className="font-black text-slate-700 text-sm">
                  💰 {displayAmt}
                </span>
              </div>
            </div>
          );
        })}

        {/* 🧱 物理防護：巨大留白區，讓你把清單往上滑到底 */}
        <div className="h-[200px] w-full flex items-end justify-center pb-4 opacity-50"></div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 max-w-md mx-auto relative font-sans overflow-x-hidden pb-[180px]">
      <style>{`
        /* 隱藏原生滾動條，讓整體看起來更像 App */
        ::-webkit-scrollbar { display: none; }
        html { -ms-overflow-style: none; scrollbar-width: none; scroll-behavior: smooth; }
      `}</style>

      {msg && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-full text-white text-sm font-bold shadow-lg animate-in fade-in slide-in-from-top-4 ${
            msg.type === "error"
              ? "bg-red-500"
              : msg.type === "warning"
              ? "bg-amber-500"
              : "bg-emerald-500"
          }`}
        >
          {msg.text}
        </div>
      )}

      {showLogin && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-[2rem] p-6 sm:p-8 space-y-6 shadow-2xl animate-in zoom-in-95">
            <h1 className="text-2xl font-black text-center text-slate-800">
              登入 {SITE_NAME}
            </h1>
            <div className="flex bg-slate-100 p-1.5 rounded-2xl">
              {["A", "B", "C"].map((g) => (
                <button
                  key={g}
                  onClick={() => setLoginGroup(g)}
                  className={`flex-1 py-3 text-sm font-black rounded-xl transition-all touch-manipulation ${
                    loginGroup === g
                      ? "bg-white shadow-sm text-blue-600"
                      : "text-slate-400"
                  }`}
                >
                  {g}組
                </button>
              ))}
            </div>
            <div className="max-h-[40vh] overflow-y-auto grid grid-cols-2 gap-3 pr-2">
              {ROSTER[loginGroup].map((n) => (
                <button
                  key={n}
                  onClick={() => handleLogin(n)}
                  className="p-4 border-2 border-slate-100 rounded-2xl font-black text-slate-700 hover:border-blue-200 active:bg-blue-50 active:scale-95 transition-all touch-manipulation"
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showPostModal && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-end justify-center">
          <div className="bg-white w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-[2rem] p-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] animate-in slide-in-from-bottom-full shadow-[0_-10px_40px_rgba(0,0,0,0.2)]">
            <h2 className="text-2xl font-black mb-6 text-slate-800">
              {modalType === "red" ? "🔴 發布休假單" : "🟢 發布加班單"}
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                postOrder({
                  date: postDate,
                  shiftType: postShift,
                  type: modalType,
                  reason: postReason,
                  amount: postAmount,
                });
              }}
              className="space-y-5"
            >
              <div>
                <label className="text-xs font-bold text-slate-500 ml-1 mb-1.5 block">
                  選擇日期
                </label>
                <input
                  required
                  type="date"
                  value={postDate}
                  onChange={(e) => setPostDate(e.target.value)}
                  className="w-full p-4 bg-slate-100 rounded-2xl font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 ml-1 mb-1.5 block">
                  選擇班別
                </label>
                <select
                  value={postShift}
                  onChange={(e) => setPostShift(e.target.value)}
                  className="w-full p-4 bg-slate-100 rounded-2xl font-medium focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                >
                  <option value="FULL">日夜</option>
                  <option value="DAY">日班</option>
                  <option value="NIGHT">夜班</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 ml-1 mb-1.5 block">
                  金額配置 (預設1000)
                </label>
                <div className="flex gap-2 mb-3">
                  {["0", "500", "1000", "1500"].map((amt) => (
                    <button
                      type="button"
                      key={amt}
                      onClick={() => setPostAmount(amt)}
                      className={`flex-1 py-3 text-sm font-black rounded-xl border-2 transition-all touch-manipulation active:scale-95 ${
                        postAmount === String(amt)
                          ? "bg-blue-50 border-blue-500 text-blue-700"
                          : "bg-white border-slate-100 text-slate-500"
                      }`}
                    >
                      {amt}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  placeholder="或手動輸入其他金額..."
                  value={postAmount}
                  onChange={(e) => setPostAmount(e.target.value)}
                  className="w-full p-4 bg-slate-100 rounded-2xl font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <div className="flex justify-between items-center ml-1 mb-1.5 mt-2">
                  <label className="text-xs font-bold text-slate-500">
                    備註原因 (非必填)
                  </label>
                  <span
                    className={`text-xs font-bold ${
                      postReason.length >= 10
                        ? "text-red-500"
                        : "text-slate-400"
                    }`}
                  >
                    {postReason.length}/10
                  </span>
                </div>
                <input
                  type="text"
                  placeholder="例如：要出國、看醫生..."
                  maxLength="10"
                  value={postReason}
                  onChange={(e) => setPostReason(e.target.value)}
                  className="w-full p-4 bg-slate-100 rounded-2xl font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowPostModal(false)}
                  className="flex-1 p-4 font-black text-slate-500 bg-slate-100 rounded-2xl active:scale-95 touch-manipulation transition-all"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className={`flex-1 p-4 rounded-2xl font-black text-white shadow-lg active:scale-95 touch-manipulation transition-all ${
                    modalType === "red"
                      ? "bg-red-500 shadow-red-500/30"
                      : "bg-emerald-500 shadow-emerald-500/30"
                  }`}
                >
                  確認發布
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <header className="sticky top-0 bg-white/90 backdrop-blur-md p-4 flex justify-between items-center z-40 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)]">
        <h1 className="font-black text-slate-800 tracking-wide">{SITE_NAME}</h1>
        <button
          onClick={() => {
            setActiveName(null);
            setShowLogin(true);
          }}
          className="p-2.5 bg-slate-100 text-slate-600 rounded-full hover:bg-slate-200 active:scale-90 transition-all touch-manipulation"
        >
          <LogOut size={16} />
        </button>
      </header>

      <main className="relative">
        {activeTab === "home" ? renderHome() : renderCompleted()}
      </main>

      {/* 🧱 物理防護：把底部導覽列「長高 90px (pb-[90px])」，按鈕就會被迫往上推！ */}
      <nav className="fixed bottom-0 w-full max-w-md bg-white/95 backdrop-blur-md border-t pt-2 pb-[90px] flex justify-around items-center z-40 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)]">
        <button
          onClick={() => setActiveTab("home")}
          className={`flex-1 py-2 flex flex-col items-center transition-all touch-manipulation active:scale-95 ${
            activeTab === "home"
              ? "text-blue-600"
              : "text-slate-400 hover:text-slate-600"
          }`}
        >
          <Home size={24} strokeWidth={activeTab === "home" ? 2.5 : 2} />
          <span className="text-[10px] font-black mt-1 tracking-wide">
            佈告欄
          </span>
        </button>
        <button
          onClick={() => setActiveTab("completed")}
          className={`flex-1 py-2 flex flex-col items-center transition-all touch-manipulation active:scale-95 ${
            activeTab === "completed"
              ? "text-blue-600"
              : "text-slate-400 hover:text-slate-600"
          }`}
        >
          <CheckCircle
            size={24}
            strokeWidth={activeTab === "completed" ? 2.5 : 2}
          />
          <span className="text-[10px] font-black mt-1 tracking-wide">
            完成區
          </span>
        </button>
      </nav>
    </div>
  );
}
