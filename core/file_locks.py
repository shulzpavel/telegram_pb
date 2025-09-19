"""
File locking utilities to prevent race conditions
"""
import fcntl
import contextlib
import logging
from typing import Generator, TextIO, Union, Dict
from pathlib import Path

logger = logging.getLogger(__name__)


@contextlib.contextmanager
def file_lock(file_path: Union[str, Path], mode: str = 'r+') -> Generator[TextIO, None, None]:
    """
    Context manager for file locking to prevent race conditions
    
    Args:
        file_path: Path to the file
        mode: File open mode
        
    Yields:
        TextIO: Locked file handle
        
    Example:
        with file_lock('data/sessions.json', 'r+') as f:
            data = json.load(f)
            # modify data
            f.seek(0)
            json.dump(data, f)
    """
    file_path = Path(file_path)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    
    try:
        with open(file_path, mode, encoding='utf-8') as f:
            # Acquire exclusive lock
            fcntl.flock(f.fileno(), fcntl.LOCK_EX)
            logger.debug(f"Acquired lock for {file_path}")
            yield f
    except (OSError, IOError) as e:
        logger.error(f"Failed to acquire lock for {file_path}: {e}")
        raise
    finally:
        try:
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)
            logger.debug(f"Released lock for {file_path}")
        except (OSError, IOError) as e:
            logger.error(f"Failed to release lock for {file_path}: {e}")


@contextlib.contextmanager
def shared_file_lock(file_path: Union[str, Path], mode: str = 'r') -> Generator[TextIO, None, None]:
    """
    Context manager for shared file locking (read-only)
    
    Args:
        file_path: Path to the file
        mode: File open mode
        
    Yields:
        TextIO: Locked file handle
    """
    file_path = Path(file_path)
    
    try:
        with open(file_path, mode, encoding='utf-8') as f:
            # Acquire shared lock
            fcntl.flock(f.fileno(), fcntl.LOCK_SH)
            logger.debug(f"Acquired shared lock for {file_path}")
            yield f
    except (OSError, IOError) as e:
        logger.error(f"Failed to acquire shared lock for {file_path}: {e}")
        raise
    finally:
        try:
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)
            logger.debug(f"Released shared lock for {file_path}")
        except (OSError, IOError) as e:
            logger.error(f"Failed to release shared lock for {file_path}: {e}")


class FileLockManager:
    """Manager for file locks with timeout"""
    
    def __init__(self, timeout: float = 5.0):
        self.timeout = timeout
        self._locks: Dict[str, TextIO] = {}
    
    def acquire_lock(self, file_path: Union[str, Path], mode: str = 'r+') -> bool:
        """Acquire file lock with timeout"""
        file_path = str(file_path)
        
        if file_path in self._locks:
            return True
        
        try:
            import time
            start_time = time.time()
            
            while time.time() - start_time < self.timeout:
                try:
                    f = open(file_path, mode, encoding='utf-8')
                    fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                    self._locks[file_path] = f
                    logger.debug(f"Acquired lock for {file_path}")
                    return True
                except (OSError, IOError):
                    time.sleep(0.1)
            
            logger.warning(f"Failed to acquire lock for {file_path} within {self.timeout}s")
            return False
            
        except Exception as e:
            logger.error(f"Error acquiring lock for {file_path}: {e}")
            return False
    
    def release_lock(self, file_path: Union[str, Path]) -> None:
        """Release file lock"""
        file_path = str(file_path)
        
        if file_path in self._locks:
            try:
                f = self._locks[file_path]
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)
                f.close()
                del self._locks[file_path]
                logger.debug(f"Released lock for {file_path}")
            except (OSError, IOError) as e:
                logger.error(f"Failed to release lock for {file_path}: {e}")
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        for file_path in list(self._locks.keys()):
            self.release_lock(file_path)
