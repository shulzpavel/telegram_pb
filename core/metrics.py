"""
Metrics and monitoring system
"""
import time
import logging
from typing import Dict, Any, Optional, List, Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from collections import defaultdict, deque
from threading import Lock

logger = logging.getLogger(__name__)


@dataclass
class Metric:
    """Metric data structure"""
    name: str
    value: float
    timestamp: datetime
    tags: Dict[str, str] = field(default_factory=dict)
    unit: Optional[str] = None


@dataclass
class Counter:
    """Counter metric"""
    name: str
    value: int = 0
    tags: Dict[str, str] = field(default_factory=dict)


@dataclass
class Gauge:
    """Gauge metric"""
    name: str
    value: float = 0.0
    tags: Dict[str, str] = field(default_factory=dict)


@dataclass
class Histogram:
    """Histogram metric"""
    name: str
    values: deque = field(default_factory=lambda: deque(maxlen=1000))
    tags: Dict[str, str] = field(default_factory=dict)
    
    @property
    def count(self) -> int:
        return len(self.values)
    
    @property
    def sum(self) -> float:
        return sum(self.values)
    
    @property
    def avg(self) -> float:
        return self.sum / self.count if self.count > 0 else 0.0
    
    @property
    def min(self) -> float:
        return min(self.values) if self.values else 0.0
    
    @property
    def max(self) -> float:
        return max(self.values) if self.values else 0.0


class MetricsCollector:
    """Metrics collector"""
    
    def __init__(self):
        self._counters: Dict[str, Counter] = {}
        self._gauges: Dict[str, Gauge] = {}
        self._histograms: Dict[str, Histogram] = {}
        self._lock = Lock()
        self._start_time = time.time()
    
    def increment_counter(self, name: str, value: int = 1, tags: Optional[Dict[str, str]] = None) -> None:
        """Increment counter metric"""
        with self._lock:
            key = self._make_key(name, tags)
            if key not in self._counters:
                self._counters[key] = Counter(name=name, tags=tags or {})
            self._counters[key].value += value
    
    def set_gauge(self, name: str, value: float, tags: Optional[Dict[str, str]] = None) -> None:
        """Set gauge metric"""
        with self._lock:
            key = self._make_key(name, tags)
            self._gauges[key] = Gauge(name=name, value=value, tags=tags or {})
    
    def observe_histogram(self, name: str, value: float, tags: Optional[Dict[str, str]] = None) -> None:
        """Observe histogram metric"""
        with self._lock:
            key = self._make_key(name, tags)
            if key not in self._histograms:
                self._histograms[key] = Histogram(name=name, tags=tags or {})
            self._histograms[key].values.append(value)
    
    def _make_key(self, name: str, tags: Optional[Dict[str, str]]) -> str:
        """Make key for metric storage"""
        if not tags:
            return name
        tag_str = ",".join(f"{k}={v}" for k, v in sorted(tags.items()))
        return f"{name}:{tag_str}"
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get all metrics"""
        with self._lock:
            return {
                "counters": {k: {"name": v.name, "value": v.value, "tags": v.tags} 
                           for k, v in self._counters.items()},
                "gauges": {k: {"name": v.name, "value": v.value, "tags": v.tags} 
                         for k, v in self._gauges.items()},
                "histograms": {k: {"name": v.name, "count": v.count, "sum": v.sum, 
                                 "avg": v.avg, "min": v.min, "max": v.max, "tags": v.tags}
                             for k, v in self._histograms.items()},
                "uptime": time.time() - self._start_time
            }


class PerformanceMonitor:
    """Performance monitoring decorator"""
    
    def __init__(self, metrics_collector: MetricsCollector):
        self.metrics = metrics_collector
    
    def measure_time(self, metric_name: str, tags: Optional[Dict[str, str]] = None):
        """Decorator to measure execution time"""
        def decorator(func):
            def wrapper(*args, **kwargs):
                start_time = time.time()
                try:
                    result = func(*args, **kwargs)
                    return result
                finally:
                    duration = time.time() - start_time
                    self.metrics.observe_histogram(metric_name, duration, tags)
            return wrapper
        return decorator
    
    def count_calls(self, metric_name: str, tags: Optional[Dict[str, str]] = None):
        """Decorator to count function calls"""
        def decorator(func):
            def wrapper(*args, **kwargs):
                self.metrics.increment_counter(metric_name, tags=tags)
                return func(*args, **kwargs)
            return wrapper
        return decorator


class HealthChecker:
    """Health check system"""
    
    def __init__(self):
        self._checks: Dict[str, Callable[[], bool]] = {}
        self._last_results: Dict[str, bool] = {}
    
    def add_check(self, name: str, check_func: Callable[[], bool]) -> None:
        """Add health check"""
        self._checks[name] = check_func
    
    def run_checks(self) -> Dict[str, bool]:
        """Run all health checks"""
        results = {}
        for name, check_func in self._checks.items():
            try:
                results[name] = check_func()
            except Exception as e:
                logger.error(f"Health check {name} failed: {e}")
                results[name] = False
            self._last_results[name] = results[name]
        return results
    
    def get_status(self) -> str:
        """Get overall health status"""
        if not self._last_results:
            return "unknown"
        
        if all(self._last_results.values()):
            return "healthy"
        elif any(self._last_results.values()):
            return "degraded"
        else:
            return "unhealthy"


# Global instances
metrics_collector = MetricsCollector()
performance_monitor = PerformanceMonitor(metrics_collector)
health_checker = HealthChecker()


# Convenience functions
def increment_counter(name: str, value: int = 1, tags: Optional[Dict[str, str]] = None) -> None:
    """Increment counter metric"""
    metrics_collector.increment_counter(name, value, tags)


def set_gauge(name: str, value: float, tags: Optional[Dict[str, str]] = None) -> None:
    """Set gauge metric"""
    metrics_collector.set_gauge(name, value, tags)


def observe_histogram(name: str, value: float, tags: Optional[Dict[str, str]] = None) -> None:
    """Observe histogram metric"""
    metrics_collector.observe_histogram(name, value, tags)


def measure_time(metric_name: str, tags: Optional[Dict[str, str]] = None):
    """Measure execution time"""
    return performance_monitor.measure_time(metric_name, tags)


def count_calls(metric_name: str, tags: Optional[Dict[str, str]] = None):
    """Count function calls"""
    return performance_monitor.count_calls(metric_name, tags)
