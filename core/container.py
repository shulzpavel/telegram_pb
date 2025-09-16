"""
Dependency Injection Container
"""
from typing import Dict, Type, TypeVar, Callable, Any, Optional
from functools import lru_cache
import logging

logger = logging.getLogger(__name__)

T = TypeVar('T')


class Container:
    """Simple dependency injection container"""
    
    def __init__(self):
        self._services: Dict[Type, Any] = {}
        self._factories: Dict[Type, Callable] = {}
        self._singletons: Dict[Type, Any] = {}
    
    def register_singleton(self, interface: Type[T], implementation: Type[T]) -> None:
        """Register singleton service"""
        self._services[interface] = implementation
        logger.debug(f"Registered singleton: {interface.__name__} -> {implementation.__name__}")
    
    def register_factory(self, interface: Type[T], factory: Callable[[], T]) -> None:
        """Register factory for service"""
        self._factories[interface] = factory
        logger.debug(f"Registered factory: {interface.__name__}")
    
    def register_instance(self, interface: Type[T], instance: T) -> None:
        """Register service instance"""
        self._singletons[interface] = instance
        logger.debug(f"Registered instance: {interface.__name__}")
    
    def get(self, interface: Type[T]) -> T:
        """Get service instance"""
        # Check if already instantiated singleton
        if interface in self._singletons:
            return self._singletons[interface]
        
        # Check if we have a factory
        if interface in self._factories:
            instance = self._factories[interface]()
            self._singletons[interface] = instance
            return instance
        
        # Check if we have a service class
        if interface in self._services:
            implementation = self._services[interface]
            instance = implementation()
            self._singletons[interface] = instance
            return instance
        
        raise ValueError(f"Service {interface.__name__} not registered")
    
    def clear(self) -> None:
        """Clear all registrations"""
        self._services.clear()
        self._factories.clear()
        self._singletons.clear()
        logger.debug("Container cleared")


# Global container instance
container = Container()
