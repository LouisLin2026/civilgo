# Gemini Car Mode Prompt

請依照 CivilGo Schema 建立車用語音教材。

要求：

1. 適合駕車時收聽

2. 單課長度：

* 3分鐘版
* 10分鐘版
* 20分鐘版

3. 使用口語化說明

4. 優先使用口訣

5. 優先說明國考常考觀念

6. 每課結尾加入：

快問快答 5 題

7. JSON 格式輸出

Schema：

{
"day": 1,
"topic": "",
"podcast_3min": "",
"podcast_10min": "",
"podcast_20min": "",
"rapid_review": [],
"car_quiz": []
}
