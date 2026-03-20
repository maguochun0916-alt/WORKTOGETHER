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
  increment,
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
  AlertCircle,
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
  appId: "1:971422172769:web:718c4a2aa464d7b10b4c20", // 修正後的 App ID
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

// 修正日期邏輯：強制中午 12 點避免時差偏移
const isWorkingDay = (dateStr, group) => {
  if (!dateStr) return false;
  const target = new Date(`${dateStr}T12:00:00`);
  const base = new Date("2026-02-01T12:00:00");
  const diffDays = Math.round(
    (target.getTime() - base.getTime()) / (1000 * 60 * 60 * 24)
  );
  const dayIdx = ((diffDays % 6) + 6) % 6;

  if ([1, 3, 5].includes(dayIdx)) return false;
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
  if (points >= 2) return "本月未加班";
  if (points === 1) return "本月已加半天班";
  if (points === 0) return "本月加班時數已滿";
  return "加班時數已超額";
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
    document.title = SITE_NAME;
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

    // 檢查重複
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

    try {
      await addDoc(
        collection(db, "artifacts", PROJECT_ID, "public", "data", "orders"),
        {
          creatorId: userData.name,
          creatorName: userData.name,
          creatorGroup: userData.group,
          date,
          shiftType,
          type,
          reason: reason.trim(),
          amount: Number(amount) || 1000,
          status: "open",
          createdAt: serverTimestamp(),
        }
      );
      setShowPostModal(false);
      showToast("✅ 發布成功！", "success");
    } catch (e) {
      showToast("❌ 儲存失敗", "error");
    }
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

    // 衝突檢查
    if (
      isWorkingDay(
        order.date,
        userData.name === workerId ? userData.group : order.creatorGroup
      )
    ) {
      showToast("🚫 勤務時間衝突！", "error");
      return;
    }

    try {
      await updateDoc(
        doc(db, "artifacts", PROJECT_ID, "public", "data", "orders", order.id),
        {
          status: "matched",
          workerId: userData.name,
          workerName: userData.name,
          matchedAt: serverTimestamp(),
        }
      );

      // 使用 increment 原子更新，防止多人同時扣分錯誤
      await updateDoc(workerRef, { points: increment(-cost) });

      showToast("🤝 配對成功！", "success");
      setActiveTab("completed");
    } catch (e) {
      showToast("❌ 處理失敗", "error");
    }
  };

  const deleteOrder = async (id) => {
    if (!window.confirm("確定要刪除這筆紀錄嗎？")) return;
    await deleteDoc(
      doc(db, "artifacts", PROJECT_ID, "public", "data", "orders", id)
    );
    showToast("🗑️ 已移除紀錄");
  };

  const renderHome = () => (
    <div className="p-4 sm:p-6 space-y-6 animate-in fade-in duration-500">
      {/* 個人狀態卡 */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden border border-slate-700">
        <div className="flex justify-between items-start relative z-10">
          <div>
            <p className="opacity-60 text-xs font-bold tracking-widest uppercase">
              My Status
            </p>
            <h2 className="text-2xl font-black mt-1">
              {userData?.name}{" "}
              <span className="text-blue-400 text-sm">
                ({userData?.group}組)
              </span>
            </h2>
          </div>
          <div className="bg-white/10 px-3 py-1 rounded-full backdrop-blur-md border border-white/10 text-xs font-bold">
            點數: {userData?.points ?? 0}
          </div>
        </div>
        <div className="mt-6 relative z-10">
          <p className="text-[10px] opacity-50 mb-1 font-bold uppercase tracking-wider">
            加班狀態指標
          </p>
          <h3
            className={`text-lg font-bold ${
              userData?.points < 0 ? "text-red-400" : "text-emerald-400"
            }`}
          >
            {getPointsStatusText(userData?.points)}
          </h3>
        </div>
        <TrendingUp
          size={80}
          className="absolute -right-4 -bottom-4 opacity-5 text-white"
        />
      </div>

      {/* 快速按鈕 */}
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => {
            setModalType("red");
            setPostDate("");
            setPostReason("");
            setPostAmount("1000");
            setShowPostModal(true);
          }}
          className="bg-white p-5 rounded-3xl shadow-sm border-2 border-red-50 text-red-600 font-black flex flex-col items-center gap-2 active:scale-95 transition-all hover:bg-red-50/50"
        >
          <div className="bg-red-100 p-2 rounded-2xl">
            <PlusCircle size={24} />
          </div>
          <span>發布休假單</span>
        </button>
        <button
          onClick={() => {
            setModalType("green");
            setPostDate("");
            setPostReason("");
            setPostAmount("1000");
            setShowPostModal(true);
          }}
          className="bg-white p-5 rounded-3xl shadow-sm border-2 border-emerald-50 text-emerald-600 font-black flex flex-col items-center gap-2 active:scale-95 transition-all hover:bg-emerald-50/50"
        >
          <div className="bg-emerald-100 p-2 rounded-2xl">
            <PlusCircle size={24} />
          </div>
          <span>發布加班單</span>
        </button>
      </div>

      {/* 佈告欄清單 */}
      <div className="space-y-4">
        <h2 className="text-lg font-black flex items-center gap-2 text-slate-800 ml-1">
          <ClipboardList size={20} className="text-blue-500" /> 最新需求 (
          {openOrders.length})
        </h2>
        {openOrders.length === 0 ? (
          <div className="bg-slate-100 rounded-3xl p-10 text-center text-slate-400 font-bold border-2 border-dashed border-slate-200">
            目前沒有待處理的單據
          </div>
        ) : (
          openOrders.map((order) => {
            const isOwn = userData?.name === order.creatorId;
            return (
              <div
                key={order.id}
                className="bg-white p-5 rounded-[2rem] border border-slate-100 flex flex-col shadow-sm relative transition-all hover:shadow-md"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <span
                      className={`text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-tighter ${
                        order.type === "red"
                          ? "bg-red-100 text-red-600"
                          : "bg-emerald-100 text-emerald-600"
                      }`}
                    >
                      {order.type === "red" ? "🛑 我要休假" : "✅ 我要加班"}
                    </span>
                    <h3 className="text-xl font-black text-slate-800 mt-2">
                      {new Date(order.date).toLocaleDateString("zh-TW", {
                        month: "short",
                        day: "numeric",
                        weekday: "short",
                      })}
                    </h3>
                  </div>
                  {(isOwn || isAdmin) && (
                    <button
                      onClick={() => deleteOrder(order.id)}
                      className="p-2 text-slate-300 hover:text-red-500 active:scale-90 transition-all"
                    >
                      <X size={20} />
                    </button>
                  )}
                </div>

                {/* 留言訊息區 - 這裡修正了顯示問題 */}
                {order.reason && (
                  <div className="bg-slate-50 p-3 rounded-2xl mb-4 flex items-start gap-2 border border-slate-100">
                    <MessageSquare
                      size={14}
                      className="text-slate-400 mt-0.5 shrink-0"
                    />
                    <p className="text-xs font-bold text-slate-600 leading-relaxed break-words">
                      {order.reason}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between mt-auto">
                  <div className="text-sm font-bold text-slate-400">
                    <span className="text-slate-800">{order.creatorName}</span>{" "}
                    · {SHIFT_TYPES[order.shiftType].label}
                    <div className="text-blue-600 font-black mt-0.5">
                      💰 NT$ {order.amount || 1000}
                    </div>
                  </div>
                  <button
                    onClick={() => handleMatch(order)}
                    disabled={isOwn}
                    className={`px-6 py-3 rounded-2xl text-sm font-black transition-all active:scale-90 ${
                      isOwn
                        ? "bg-slate-100 text-slate-300 cursor-not-allowed"
                        : "bg-slate-800 text-white shadow-lg shadow-slate-200"
                    }`}
                  >
                    {isOwn ? "等待中" : "接受"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="h-20" />
    </div>
  );

  const renderCompleted = () => (
    <div className="p-4 sm:p-6 space-y-4 animate-in slide-in-from-right-10 duration-500">
      <h2 className="text-lg font-black flex items-center gap-2 text-slate-800 ml-1">
        <History size={20} className="text-blue-500" /> 配對成功紀錄
      </h2>
      {matchedOrders.length === 0 ? (
        <div className="bg-slate-100 rounded-3xl p-10 text-center text-slate-400 font-bold">
          尚無完成紀錄
        </div>
      ) : (
        matchedOrders.map((order) => (
          <div
            key={order.id}
            className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group"
          >
            <div className="absolute top-0 right-0 p-4">
              <CheckCircle
                className="text-emerald-100 group-hover:text-emerald-500 transition-colors"
                size={40}
              />
            </div>
            <div className="flex items-center gap-4 mb-4">
              <div className="text-center">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  休假人員
                </p>
                <p className="font-black text-slate-700">
                  {order.type === "red" ? order.creatorName : order.workerName}
                </p>
              </div>
              <ArrowRightLeft className="text-slate-200" size={20} />
              <div className="text-center">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  代班人員
                </p>
                <p className="font-black text-blue-600">
                  {order.type === "red" ? order.workerName : order.creatorName}
                </p>
              </div>
            </div>
            <div className="pt-3 border-t border-dashed flex justify-between items-center text-xs font-bold text-slate-500">
              <span>
                {order.date} · {SHIFT_TYPES[order.shiftType].label}
              </span>
              <span className="text-slate-800">💰 {order.amount || 1000}</span>
            </div>
          </div>
        ))
      )}
      <div className="h-20" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] max-w-md mx-auto relative font-sans overflow-x-hidden selection:bg-blue-100">
      <style>{`
        ::-webkit-scrollbar { display: none; }
        * { -webkit-tap-highlight-color: transparent; }
        input, select { -webkit-appearance: none; }
      `}</style>

      {/* 提示訊息 */}
      {msg && (
        <div
          className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-4 rounded-3xl text-white text-sm font-black shadow-2xl flex items-center gap-2 animate-in slide-in-from-top-full duration-300 ${
            msg.type === "error" ? "bg-red-500" : "bg-emerald-500"
          }`}
        >
          {msg.type === "error" ? (
            <AlertCircle size={18} />
          ) : (
            <CheckCircle size={18} />
          )}
          {msg.text}
        </div>
      )}

      {/* 登入介面 */}
      {showLogin && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 space-y-8 shadow-2xl border border-white/20">
            <div className="text-center">
              <h1 className="text-3xl font-black text-slate-800">
                {SITE_NAME}
              </h1>
              <p className="text-slate-400 text-sm font-bold mt-2 italic">
                Duty Support Center
              </p>
            </div>
            <div className="flex bg-slate-100 p-1.5 rounded-2xl">
              {["A", "B", "C"].map((g) => (
                <button
                  key={g}
                  onClick={() => setLoginGroup(g)}
                  className={`flex-1 py-3 text-sm font-black rounded-xl transition-all ${
                    loginGroup === g
                      ? "bg-white shadow-md text-blue-600"
                      : "text-slate-400"
                  }`}
                >
                  {g}組
                </button>
              ))}
            </div>
            <div className="max-h-[40vh] overflow-y-auto grid grid-cols-2 gap-3 pr-2 scrollbar-hide">
              {ROSTER[loginGroup].map((n) => (
                <button
                  key={n}
                  onClick={() => handleLogin(n)}
                  className="p-4 bg-slate-50 border-2 border-transparent rounded-2xl font-black text-slate-700 hover:border-blue-400 active:bg-blue-50 active:scale-95 transition-all text-sm"
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 發布彈窗 */}
      {showPostModal && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-end justify-center">
          <div className="bg-white w-full max-w-md rounded-t-[3rem] p-8 pb-10 animate-in slide-in-from-bottom-full duration-500 shadow-2xl border-t border-white/20">
            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-8" />
            <h2 className="text-2xl font-black mb-6 text-slate-800 flex items-center gap-2">
              {modalType === "red" ? (
                <span className="text-red-500">🛑 發布休假單</span>
              ) : (
                <span className="text-emerald-500">✅ 發布加班單</span>
              )}
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
              className="space-y-6"
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 ml-1 mb-2 block uppercase tracking-wider">
                    日期
                  </label>
                  <input
                    required
                    type="date"
                    value={postDate}
                    onChange={(e) => setPostDate(e.target.value)}
                    className="w-full p-4 bg-slate-100 rounded-2xl font-black text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 ml-1 mb-2 block uppercase tracking-wider">
                    班別
                  </label>
                  <select
                    value={postShift}
                    onChange={(e) => setPostShift(e.target.value)}
                    className="w-full p-4 bg-slate-100 rounded-2xl font-black text-sm outline-none appearance-none"
                  >
                    <option value="FULL">全天 (2點)</option>
                    <option value="DAY">日班 (1點)</option>
                    <option value="NIGHT">夜班 (1點)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 ml-1 mb-2 block uppercase tracking-wider">
                  金額設定
                </label>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {["0", "500", "1000", "1500"].map((amt) => (
                    <button
                      type="button"
                      key={amt}
                      onClick={() => setPostAmount(amt)}
                      className={`py-3 text-xs font-black rounded-xl border-2 transition-all ${
                        postAmount === amt
                          ? "border-blue-500 bg-blue-50 text-blue-600"
                          : "border-slate-100 bg-white text-slate-400"
                      }`}
                    >
                      {amt}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  placeholder="或其他金額..."
                  value={postAmount}
                  onChange={(e) => setPostAmount(e.target.value)}
                  className="w-full p-4 bg-slate-100 rounded-2xl font-black text-sm outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 ml-1 mb-2 block uppercase tracking-wider flex justify-between">
                  備註原因 <span>{postReason.length}/10</span>
                </label>
                <input
                  type="text"
                  placeholder="例如：出國、身體不適..."
                  maxLength="10"
                  value={postReason}
                  onChange={(e) => setPostReason(e.target.value)}
                  className="w-full p-4 bg-slate-100 rounded-2xl font-black text-sm outline-none"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setShowPostModal(false)}
                  className="flex-1 p-5 font-black text-slate-400 bg-slate-50 rounded-2xl active:scale-95 transition-all"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className={`flex-1 p-5 rounded-2xl font-black text-white shadow-xl active:scale-95 transition-all ${
                    modalType === "red"
                      ? "bg-red-500 shadow-red-100"
                      : "bg-emerald-500 shadow-emerald-100"
                  }`}
                >
                  發布需求
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 頁首 */}
      <header className="sticky top-0 bg-white/80 backdrop-blur-xl px-6 py-5 flex justify-between items-center z-40 border-b border-slate-100">
        <h1 className="font-black text-xl text-slate-800 tracking-tighter">
          {SITE_NAME}
        </h1>
        <button
          onClick={() => {
            setActiveName(null);
            setShowLogin(true);
          }}
          className="p-3 bg-slate-100 text-slate-500 rounded-2xl active:scale-90 transition-all"
        >
          <LogOut size={18} />
        </button>
      </header>

      {/* 主要內容區 */}
      <main className="pb-32 min-h-screen">
        {activeTab === "home" ? renderHome() : renderCompleted()}
      </main>

      {/* 底部導覽列 */}
      <nav className="fixed bottom-6 left-6 right-6 h-20 bg-slate-900/90 backdrop-blur-lg rounded-[2.5rem] flex items-center justify-around z-50 shadow-2xl shadow-slate-300 border border-white/10">
        <button
          onClick={() => setActiveTab("home")}
          className={`flex flex-col items-center gap-1 transition-all ${
            activeTab === "home" ? "text-blue-400 scale-110" : "text-slate-500"
          }`}
        >
          <Home size={22} strokeWidth={activeTab === "home" ? 2.5 : 2} />
          <span className="text-[10px] font-black uppercase tracking-tighter">
            佈告欄
          </span>
        </button>
        <button
          onClick={() => setActiveTab("completed")}
          className={`flex flex-col items-center gap-1 transition-all ${
            activeTab === "completed"
              ? "text-blue-400 scale-110"
              : "text-slate-500"
          }`}
        >
          <History
            size={22}
            strokeWidth={activeTab === "completed" ? 2.5 : 2}
          />
          <span className="text-[10px] font-black uppercase tracking-tighter">
            完成區
          </span>
        </button>
      </nav>
    </div>
  );
}
