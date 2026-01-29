import logging
from typing import Dict, Any, List
from app.db.connection import get_conn

logger = logging.getLogger(__name__)


class ChatDBService:
    """Service layer cho chat database operations sử dụng Stored Procedures"""
    
    @staticmethod
    def register_qa_log(
        session_id: str,
        turn_no: int,
        user_cd: int,  # IDENTITY - bigint từ M_User
        question_text: str,
        answer_text: str
    ) -> Dict[str, Any]:
        """
        Lưu Q&A log vào database sử dụng SP Register_QA_Log
        
        Args:
            session_id: UUID của session chat (varchar(36))
            turn_no: Số thứ tự lượt chat trong session (int)
            user_cd: UserCD từ M_User (IDENTITY bigint)
            question_text: Câu hỏi của user (nvarchar(max))
            answer_text: Câu trả lời của AI (nvarchar(max))
            
        Returns:
            Dict chứa qa_log_cd (IDENTITY bigint) và error info
        """
        conn = None
        try:
            conn = get_conn()
            cursor = conn.cursor()
            
            # Execute stored procedure với OUTPUT parameters
            result = cursor.execute("""
                DECLARE @OUT_QALogCD BIGINT;
                DECLARE @OUT_ERR_CD INT;
                DECLARE @OUT_ERR_MSG NVARCHAR(MAX);
                
                EXEC [dbo].[Register_QA_Log]
                    @IN_SessionId = ?,
                    @IN_TurnNo = ?,
                    @IN_UserCD = ?,
                    @IN_QuestionText = ?,
                    @IN_AnswerText = ?,
                    @OUT_QALogCD = @OUT_QALogCD OUTPUT,
                    @OUT_ERR_CD = @OUT_ERR_CD OUTPUT,
                    @OUT_ERR_MSG = @OUT_ERR_MSG OUTPUT;
                
                SELECT @OUT_QALogCD AS QALogCD, @OUT_ERR_CD AS ErrCD, @OUT_ERR_MSG AS ErrMsg;
            """, (session_id, turn_no, user_cd, question_text, answer_text))
            
            row = result.fetchone()
            conn.commit()
            
            if row:
                qa_log_cd = row.QALogCD if row.QALogCD is not None else None
                err_cd = row.ErrCD if row.ErrCD is not None else 0
                err_msg = row.ErrMsg
                
                if err_cd and err_cd != 0:
                    logger.error(f"Register_QA_Log error: {err_cd} - {err_msg}")
                    return {
                        "success": False,
                        "error_code": err_cd,
                        "error_message": err_msg
                    }
                
                logger.info(f"Registered QA log: QALogCD={qa_log_cd}, Session={session_id}, Turn={turn_no}, UserCD={user_cd}")
                
                return {
                    "success": True,
                    "qa_log_cd": qa_log_cd, 
                    "session_id": session_id,
                    "turn_no": turn_no
                }
            else:
                return {
                    "success": False,
                    "error_message": "No result returned from stored procedure"
                }
                
        except Exception as e:
            logger.error(f"Failed to register QA log: {str(e)}")
            if conn:
                conn.rollback()
            return {
                "success": False,
                "error_message": str(e)
            }
        finally:
            if conn:
                conn.close()
    
    @staticmethod
    def mark_resolved_qa(qa_log_cd: int) -> Dict[str, Any]:
        """
        Đánh dấu Q&A đã được giải quyết sử dụng SP Mark_Resolved_QA
        Update tất cả các QA trong cùng session với ResolvedTurnNo
        
        Args:
            qa_log_cd: QALogCD (IDENTITY bigint)
            
        Returns:
            Dict chứa success status và error info
        """
        conn = None
        try:
            conn = get_conn()
            cursor = conn.cursor()
            
            result = cursor.execute("""
                DECLARE @OUT_ERR_CD INT;
                DECLARE @OUT_ERR_MSG NVARCHAR(MAX);
                
                EXEC [dbo].[Mark_Resolved_QA]
                    @IN_QALogCD = ?,
                    @OUT_ERR_CD = @OUT_ERR_CD OUTPUT,
                    @OUT_ERR_MSG = @OUT_ERR_MSG OUTPUT;
                
                SELECT @OUT_ERR_CD AS ErrCD, @OUT_ERR_MSG AS ErrMsg;
            """, (qa_log_cd,))
            
            row = result.fetchone()
            conn.commit()
            
            if row:
                err_cd = row.ErrCD if row.ErrCD is not None else 0
                err_msg = row.ErrMsg
                
                if err_cd and err_cd != 0:
                    logger.error(f"Mark_Resolved_QA error: {err_cd} - {err_msg}")
                    return {
                        "success": False,
                        "error_code": err_cd,
                        "error_message": err_msg
                    }
                
                logger.info(f"Marked QA as resolved: QALogCD={qa_log_cd}")
                
                return {
                    "success": True,
                    "qa_log_cd": qa_log_cd
                }
            else:
                return {
                    "success": False,
                    "error_message": "No result returned from stored procedure"
                }
                
        except Exception as e:
            logger.error(f"Failed to mark QA as resolved: {str(e)}")
            if conn:
                conn.rollback()
            return {
                "success": False,
                "error_message": str(e)
            }
        finally:
            if conn:
                conn.close()
    
    @staticmethod
    def get_session_logs(session_id: str) -> List[Dict[str, Any]]:
        """
        Lấy toàn bộ chat logs của một session
        
        Args:
            session_id: UUID của session (varchar(36))
            
        Returns:
            List of QA logs
        """
        conn = None
        try:
            conn = get_conn()
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT 
                    QALogCD,        -- IDENTITY bigint
                    SessionId,      -- varchar(36)
                    TurnNo,         -- int
                    UserCD,         -- bigint
                    QuestionText,   -- nvarchar(max)
                    AnswerText,     -- nvarchar(max)
                    ResolvedTurnNo, -- int (nullable)
                    RegisteredAt    -- datetime
                FROM T_QA_Log
                WHERE SessionId = ?
                ORDER BY TurnNo ASC
            """, (session_id,))
            
            columns = [col[0] for col in cursor.description]
            rows = cursor.fetchall()
            
            logs = []
            for row in rows:
                log = dict(zip(columns, row))
                logs.append(log)
            
            return logs
            
        except Exception as e:
            logger.error(f"Failed to get session logs: {str(e)}")
            return []
        finally:
            if conn:
                conn.close()
    
    @staticmethod
    def get_user_sessions(user_cd: int, limit: int = 50) -> List[Dict[str, Any]]:
        """
        Lấy danh sách sessions của user (grouped by SessionId)
        
        Args:
            user_cd: UserCD từ M_User (IDENTITY bigint)
            limit: Số lượng sessions tối đa
            
        Returns:
            List of session summaries
        """
        conn = None
        try:
            conn = get_conn()
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT TOP (?)
                    SessionId,
                    MIN(RegisteredAt) as FirstMessageAt,
                    MAX(RegisteredAt) as LastMessageAt,
                    COUNT(*) as MessageCount,
                    MAX(TurnNo) as LastTurnNo,
                    MAX(ResolvedTurnNo) as ResolvedTurnNo,
                    (
                        SELECT TOP 1 QuestionText 
                        FROM T_QA_Log sub 
                        WHERE sub.SessionId = T_QA_Log.SessionId 
                        ORDER BY TurnNo ASC
                    ) as FirstQuestion
                FROM T_QA_Log
                WHERE UserCD = ?
                GROUP BY SessionId
                ORDER BY MAX(RegisteredAt) DESC
            """, (limit, user_cd))
            
            columns = [col[0] for col in cursor.description]
            rows = cursor.fetchall()
            
            sessions = []
            for row in rows:
                session = dict(zip(columns, row))
                sessions.append(session)
            
            return sessions
            
        except Exception as e:
            logger.error(f"Failed to get user sessions: {str(e)}")
            return []
        finally:
            if conn:
                conn.close()


# Create singleton instance
chat_db_service = ChatDBService()   