// netlify/functions/ai-translate.js
exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "尚未在 Netlify 環境變數設定 GEMINI_API_KEY" }),
    };
  }

  try {
    const { mode, text, base64Data, mimeType } = JSON.parse(event.body || "{}");
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    let contents = [];
    let systemInstruction = "";
    let responseSchema = null;

    if (mode === "menu") {
      systemInstruction = `你是陪同台灣家庭（包含50幾歲父母）在泰國曼谷旅遊的資深美食導遊。
請仔細辨識這張泰國餐廳菜單照片中的菜色，並以結構化 JSON 回傳，幫助長輩快速看懂每一道菜是什麼、會不會辣、以及推薦點哪些菜：
1. "parentTips": 一句貼心提醒，挑出菜單上最適合50幾歲爸媽、不辣又好入口的招牌菜色（若整張都不是菜單則禮貌說明）。
2. "dishes": 菜單上辨識出的主要菜色陣列（最多列出 12 道最重要的菜），每道菜包含：
   - "zhName": 台灣人一看就懂的道地中文菜名（不要死板直譯，要翻出實際料理名稱）
   - "thName": 菜單上的泰文或英文原名
   - "price": 菜單上的價格（例如 "180 ฿"，若無標示則填 "未標價"）
   - "spicyLevel": 辣度預測，只能填 "不辣"、"微辣" 或 "會辣"
   - "ingredients": 主要食材與口感簡述（例如：鮮蝦、豬肉、椰奶、炸物、生食提醒等，15字以內）
   - "parentFriendly": 布林值 true/false（是否適合長輩或可客製不辣）`;

      responseSchema = {
        type: "OBJECT",
        properties: {
          parentTips: { type: "STRING" },
          dishes: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                zhName: { type: "STRING" },
                thName: { type: "STRING" },
                price: { type: "STRING" },
                spicyLevel: { type: "STRING" },
                ingredients: { type: "STRING" },
                parentFriendly: { type: "BOOLEAN" },
              },
              required: ["zhName", "thName", "price", "spicyLevel", "ingredients", "parentFriendly"],
            },
          },
        },
        required: ["parentTips", "dishes"],
      };

      contents = [
        {
          role: "user",
          parts: [
            { text: "請幫我解讀這張泰文菜單照片，翻成台灣人看得懂的菜名、標出辣度與食材，並推薦適合爸媽的菜色。" },
            {
              inlineData: {
                mimeType: mimeType || "image/jpeg",
                data: base64Data,
              },
            },
          ],
        },
      ];
    } else {
      systemInstruction = `你是專業且貼心的泰國曼谷旅遊隨身口譯員，協助台灣旅客與50多歲父母在泰國溝通。
請將使用者輸入的「繁體中文」翻譯成「自然、禮貌、當地店員或司機一看就懂的泰文（附帶ครับ/ค่ะ禮貌語尾）」，或若使用者輸入泰文/英文則翻成繁體中文。
請務必以 JSON 格式回傳，包含三個欄位：
- "zh": 清楚的繁體中文原意或整理後的中文句子
- "th": 道地禮貌的泰文翻譯（字體清晰易讀）
- "pronounce": 給台灣人看的中文諧音發音提示與簡短使用說明`;

      responseSchema = {
        type: "OBJECT",
        properties: {
          zh: { type: "STRING" },
          th: { type: "STRING" },
          pronounce: { type: "STRING" },
        },
        required: ["zh", "th", "pronounce"],
      };

      contents = [{ role: "user", parts: [{ text: `請翻譯這句話：${text}` }] }];
    }

    const geminiRes = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema,
        },
      }),
    });

    const data = await geminiRes.json();
    if (!geminiRes.ok) {
      return {
        statusCode: geminiRes.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      };
    }

    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: rawText,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message || "伺服器發生錯誤" }),
    };
  }
};
