import json
from typing import Dict, Any, List, Optional
import logging
import uuid
from app.chat.chat_db_service import chat_db_service

logger = logging.getLogger(__name__)


class ChatService:
    """Service xử lý chat và AI responses với database integration"""

    def __init__(self):
        # Track current turn number per session (in-memory cache)
        self.session_turns: Dict[str, int] = {}

    def get_next_turn_no(self, session_id: str) -> int:
        """Lấy turn number tiếp theo cho session"""
        if session_id not in self.session_turns:
            # Load from database
            logs = chat_db_service.get_session_logs(session_id)
            if logs:
                self.session_turns[session_id] = max(log['TurnNo'] for log in logs)
            else:
                self.session_turns[session_id] = 0
        
        self.session_turns[session_id] += 1
        return self.session_turns[session_id]

    async def process_chat_message(
        self,
        user_cd: int,
        question_text: str,
        session_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Xử lý message từ user và lưu vào database
        
        Args:
            user_cd: Mã người dùng từ M_User.UserCD
            question_text: Câu hỏi của user
            session_id: UUID của session (nếu có), tạo mới nếu None
            
        Returns:
            Dict chứa response và metadata
        """
        try:
            if not session_id:
                session_id = str(uuid.uuid4())
                self.session_turns[session_id] = 0
            
            turn_no = self.get_next_turn_no(session_id)
            
            answer_text, pdf_details = self._generate_ai_response_with_pdf(question_text)
            
            answer_with_metadata = {
                "text": answer_text,
                "pdf_details": pdf_details
            }
            
            result = chat_db_service.register_qa_log(
                session_id=session_id,
                turn_no=turn_no,
                user_cd=user_cd,
                question_text=question_text,
                answer_text=json.dumps(answer_with_metadata, ensure_ascii=False)
            )
            
            if not result["success"]:
                logger.error(f"Failed to save chat: {result.get('error_message')}")
                return {
                    "success": False,
                    "error": result.get("error_message", "Failed to save chat"),
                    "session_id": session_id
                }
            
            # Format PDF info đơn giản
            has_pdf = len(pdf_details) > 0
            pdf_infos = []
            
            for pdf in pdf_details:
                pdf_infos.append({
                    "name": pdf["filename"],
                    "url": pdf["url"],
                    "page": pdf["page"]  # Chỉ cần page number
                })
            
            return {
                "success": True,
                "session_id": session_id,
                "turn_no": turn_no,
                "qa_log_cd": result.get("qa_log_cd"),
                "response": answer_text,
                "has_pdf": has_pdf,
                "pdf_infos": pdf_infos
            }
            
        except Exception as e:
            logger.error(f"Error processing chat message: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "session_id": session_id
            }

    def _generate_ai_response_with_pdf(self, question: str) -> tuple[str, List[Dict]]:
        """Tạo response AI với thông tin PDF đơn giản"""
        question_lower = question.lower()
        pdf_details = []
        answer = ""
        
        if any(k in question_lower for k in ["pdf", "ファイル", "ドキュメント", "文書"]):
            answer = (
                "お問い合わせいただきありがとうございます。\n\n"
                "PDFファイルに関するご質問ですね。\n\n"
                "以下のドキュメントを参照しました：\n"
                "1. 情報セキュリティポリシー.pdf (ページ15)\n"
                "2. トレーニングマニュアル.pdf (ページ8)\n"
            )
            
            pdf_details = [
                {
                    "filename": "情報セキュリティポリシー.pdf",
                    "url": "/download/view/FolderA/FolderA3/Tailieu.ngoaingu24h.vn.pdf",
                    "page": 2
                },
                {
                    "filename": "トレーニングマニュアル.pdf",
                    "url":  "/download/view/FolderA/FolderA3/Tailieu.ngoaingu24h.vn.pdf",
                    "page": 3
                }
            ]
                
        elif any(k in question_lower for k in ["セキュリティ", "ポリシー"]):
            answer = (
                "情報セキュリティポリシーに関するご質問ですね。\n\n"
                "関連ドキュメントを参照しました。\n"
            )
            
            pdf_details = [{
                "filename": "情報セキュリティ基本方針.pdf",
                "url":  "/download/view/FolderA/FolderA3/Tailieu.ngoaingu24h.vn.pdf",
                "page": 3
            }]
            
        elif any(k in question_lower for k in ["給与", "給料", "salary"]):
            answer = (
                "給与規定に関するご質問ですね。\n\n"
                "関連ドキュメントを参照しました。\n"
            )
            
            pdf_details = [{
                "filename": "給与規程.pdf",
                "url":  "/download/view/FolderA/FolderA3/Tailieu.ngoaingu24h.vn.pdf",
                "page": 2
            }]
            
        else:
            answer = (
                f"ご質問ありがとうございます。\n\n"
                f"「{question}」についての情報をお探しですね。\n\n"
                "より具体的な質問をいただけますと、的確な回答をご提供できます。"
            )
        
        return answer, pdf_details

    def mark_session_resolved(self, qa_log_cd: int) -> Dict[str, Any]:
        """
        Đánh dấu session đã được giải quyết
        
        Args:
            qa_log_cd: Mã QA log cần mark resolved
            
        Returns:
            Dict chứa success status
        """
        try:
            result = chat_db_service.mark_resolved_qa(qa_log_cd)
            return result
        except Exception as e:
            logger.error(f"Error marking session as resolved: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }

    def get_session_history(self, session_id: str) -> Dict[str, Any]:
        """
        Lấy lịch sử chat của một session
        
        Args:
            session_id: UUID của session
            
        Returns:
            Dict chứa session logs
        """
        try:
            logs = chat_db_service.get_session_logs(session_id)
            return {
                "success": True,
                "session_id": session_id,
                "logs": logs,
                "total_turns": len(logs)
            }
        except Exception as e:
            logger.error(f"Error getting session history: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "logs": []
            }

    def get_user_sessions(self, user_cd: int, limit: int = 50) -> Dict[str, Any]:
        """
        Lấy danh sách sessions của user
        
        Args:
            user_cd: Mã người dùng
            limit: Số lượng sessions tối đa
            
        Returns:
            Dict chứa danh sách sessions
        """
        try:
            sessions = chat_db_service.get_user_sessions(user_cd, limit)
            return {
                "success": True,
                "sessions": sessions,
                "total": len(sessions)
            }
        except Exception as e:
            logger.error(f"Error getting user sessions: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "sessions": []
            }

    def _generate_ai_response(self, question: str) -> str:
        """Mock AI response - thay thế bằng actual AI call"""
        question_lower = question.lower()
        
        if any(k in question_lower for k in ["pdf", "ファイル", "ドキュメント", "文書"]):
            return (
                "お問い合わせいただきありがとうございます。\n\n"
                "PDFファイルに関するご質問ですね。AI Chatアシスタントは、PDFドキュメントの分析をサポートしています。\n\n"
                "現在、以下のような機能をご利用いただけます：\n"
                "• PDFドキュメントの内容要約\n"
                "• 特定情報の検索と抽出\n"
                "• ドキュメント内のセキュリティポリシー確認\n"
                "• トレーニング資料の分析"
            )
        elif any(k in question_lower for k in ["セキュリティ", "トレーニング", "ポリシー"]):
            return (
                "情報セキュリティに関するご質問ですね。\n\n"
                "当社の情報セキュリティポリシーでは、以下の項目について規定しています：\n\n"
                "1. 従業員トレーニング\n"
                "2. 情報の取り扱い\n"
                "3. インシデント報告\n"
                "4. リモートワークセキュリティ"
            )
        elif any(k in question_lower for k in ["こんにちは", "hello", "hi"]):
            return (
                "こんにちは！AI Chatアシスタントです。\n\n"
                "以下のようなサポートを提供しています：\n"
                "• 情報セキュリティポリシーに関する質問\n"
                "• PDFドキュメントの分析と要約\n"
                "• トレーニング資料の内容確認"
            )
        else:
            return (
                f"ご質問ありがとうございます。\n\n"
                f"「{question}」についての情報をお探しですね。\n\n"
                "より具体的な質問をいただけますと、的確な回答をご提供できます。"
            )

    def _check_pdf_response(self, question: str, answer: str) -> tuple[bool, list]:
        """Check if response should include PDF attachments"""
        question_lower = question.lower()
        
        if any(k in question_lower for k in ["pdf", "ファイル", "ドキュメント", "文書", "セキュリティ"]):
            pdf_infos = [
                {
                    "name": "情報セキュリティポリシー.pdf",
                    "pages": 24,
                    "size": "2.4 MB",
                    "url": "/download/view/FolderA/FolderA3/Tailieu.ngoaingu24h.vn.pdf"
                }
            ]
            return True, pdf_infos
        
        return False, []
# Create singleton instance
chat_service = ChatService()