import requests
import sys
import json
import time
from datetime import datetime

class FounderIntelligenceAPITester:
    def __init__(self, base_url="https://6817d429-8a30-4c47-a032-995e401cec54.preview.emergentagent.com"):
        self.base_url = base_url
        self.session_token = "test_session_main_token_123"
        self.user_id = "test-user-main"
        self.dataset_id = "ds_b6cfdc5ed41d"
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_result(self, name, success, message="", status_code=None):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name} - PASSED")
        else:
            print(f"❌ {name} - FAILED: {message}")
        
        self.test_results.append({
            "test": name,
            "success": success,
            "message": message,
            "status_code": status_code
        })

    def test_health(self):
        """Test health endpoint"""
        try:
            response = requests.get(f"{self.base_url}/api/health", timeout=10)
            success = response.status_code == 200
            data = response.json() if success else {}
            self.log_result("Health Check", success, 
                          data.get("status", "No status") if success else f"Status {response.status_code}",
                          response.status_code)
            return success, data
        except Exception as e:
            self.log_result("Health Check", False, str(e))
            return False, {}

    def test_auth_me(self):
        """Test auth/me endpoint with Bearer token"""
        try:
            headers = {"Authorization": f"Bearer {self.session_token}"}
            response = requests.get(f"{self.base_url}/api/auth/me", headers=headers, timeout=10)
            success = response.status_code == 200
            data = response.json() if success else {}
            
            message = "Valid user data returned" if success and data.get("user_id") else f"Status {response.status_code}"
            self.log_result("Auth Me (Bearer Token)", success, message, response.status_code)
            return success, data
        except Exception as e:
            self.log_result("Auth Me (Bearer Token)", False, str(e))
            return False, {}

    def test_get_datasets(self):
        """Test get datasets with auth"""
        try:
            headers = {"Authorization": f"Bearer {self.session_token}"}
            response = requests.get(f"{self.base_url}/api/data/datasets", headers=headers, timeout=10)
            success = response.status_code == 200
            data = response.json() if success else {}
            
            message = f"Found {len(data)} datasets" if success else f"Status {response.status_code}"
            self.log_result("Get Datasets", success, message, response.status_code)
            return success, data
        except Exception as e:
            self.log_result("Get Datasets", False, str(e))
            return False, {}

    def test_upload_csv(self):
        """Test CSV upload endpoint"""
        try:
            headers = {"Authorization": f"Bearer {self.session_token}"}
            
            # Create sample CSV content
            csv_content = """month,revenue,customers,cac,churn_rate,mrr,expenses,users
2025-01,12000,45,120,3.2,12000,8500,450
2025-02,15500,52,115,2.8,15500,9200,520
2025-03,18200,61,108,2.5,18200,9800,610"""

            files = {'file': ('test_upload.csv', csv_content, 'text/csv')}
            response = requests.post(f"{self.base_url}/api/data/upload", 
                                   headers=headers, files=files, timeout=30)
            success = response.status_code == 200
            data = response.json() if success else {}
            
            message = f"Dataset {data.get('dataset_id', 'unknown')} uploaded" if success else f"Status {response.status_code}"
            self.log_result("CSV Upload", success, message, response.status_code)
            
            if success and data.get('dataset_id'):
                self.uploaded_dataset_id = data['dataset_id']
            
            return success, data
        except Exception as e:
            self.log_result("CSV Upload", False, str(e))
            return False, {}

    def test_compute_metrics(self, dataset_id=None):
        """Test compute metrics endpoint"""
        test_dataset_id = dataset_id or self.dataset_id
        try:
            headers = {"Authorization": f"Bearer {self.session_token}"}
            response = requests.post(f"{self.base_url}/api/metrics/compute/{test_dataset_id}", 
                                   headers=headers, timeout=30)
            success = response.status_code == 200
            data = response.json() if success else {}
            
            scores = []
            if success:
                scores.extend([
                    f"Growth: {data.get('growth_score', 0)}",
                    f"Efficiency: {data.get('efficiency_score', 0)}",
                    f"PMF: {data.get('pmf_signal', 0)}",
                    f"Scalability: {data.get('scalability_index', 0)}",
                    f"Capital Eff: {data.get('capital_efficiency', 0)}"
                ])
                message = ", ".join(scores)
            else:
                message = f"Status {response.status_code}"
                
            self.log_result("Compute Metrics", success, message, response.status_code)
            return success, data
        except Exception as e:
            self.log_result("Compute Metrics", False, str(e))
            return False, {}

    def test_get_metrics(self, dataset_id=None):
        """Test get metrics endpoint"""
        test_dataset_id = dataset_id or self.dataset_id
        try:
            headers = {"Authorization": f"Bearer {self.session_token}"}
            response = requests.get(f"{self.base_url}/api/metrics/{test_dataset_id}", 
                                  headers=headers, timeout=10)
            success = response.status_code == 200
            data = response.json() if success else {}
            
            message = "Metrics retrieved" if success else f"Status {response.status_code}"
            self.log_result("Get Metrics", success, message, response.status_code)
            return success, data
        except Exception as e:
            self.log_result("Get Metrics", False, str(e))
            return False, {}

    def test_generate_insights(self, dataset_id=None):
        """Test AI insights generation (GPT-5.2)"""
        test_dataset_id = dataset_id or self.dataset_id
        try:
            headers = {"Authorization": f"Bearer {self.session_token}"}
            print(f"🧠 Generating AI insights for dataset {test_dataset_id} (may take 10-20 seconds)...")
            response = requests.post(f"{self.base_url}/api/insights/generate/{test_dataset_id}", 
                                   headers=headers, timeout=60)
            success = response.status_code == 200
            data = response.json() if success else {}
            
            if success:
                insight_count = len(data.get('strategic_insights', []))
                red_flag_count = len(data.get('red_flags', []))
                opp_count = len(data.get('opportunities', []))
                message = f"Generated {insight_count} insights, {red_flag_count} red flags, {opp_count} opportunities"
            else:
                message = f"Status {response.status_code}"
                
            self.log_result("Generate AI Insights (GPT-5.2)", success, message, response.status_code)
            return success, data
        except Exception as e:
            self.log_result("Generate AI Insights (GPT-5.2)", False, str(e))
            return False, {}

    def test_get_insights(self, dataset_id=None):
        """Test get insights endpoint"""
        test_dataset_id = dataset_id or self.dataset_id
        try:
            headers = {"Authorization": f"Bearer {self.session_token}"}
            response = requests.get(f"{self.base_url}/api/insights/{test_dataset_id}", 
                                  headers=headers, timeout=10)
            success = response.status_code == 200
            data = response.json() if success else {}
            
            message = "Insights retrieved" if success else f"Status {response.status_code}"
            self.log_result("Get Insights", success, message, response.status_code)
            return success, data
        except Exception as e:
            self.log_result("Get Insights", False, str(e))
            return False, {}

    def test_generate_narrative(self):
        """Test narrative generation (GPT-5.2)"""
        try:
            headers = {
                "Authorization": f"Bearer {self.session_token}",
                "Content-Type": "application/json"
            }
            payload = {
                "dataset_id": self.dataset_id,
                "narrative_type": "traction_statement",
                "custom_context": "We just secured a key partnership"
            }
            print(f"📝 Generating narrative (may take 10-20 seconds)...")
            response = requests.post(f"{self.base_url}/api/narrative/generate", 
                                   headers=headers, json=payload, timeout=60)
            success = response.status_code == 200
            data = response.json() if success else {}
            
            if success:
                title = data.get('title', 'No title')[:50]
                highlights = len(data.get('key_highlights', []))
                message = f"Generated: '{title}' with {highlights} highlights"
            else:
                message = f"Status {response.status_code}"
                
            self.log_result("Generate Narrative (GPT-5.2)", success, message, response.status_code)
            return success, data
        except Exception as e:
            self.log_result("Generate Narrative (GPT-5.2)", False, str(e))
            return False, {}

    def test_get_narratives(self):
        """Test get narratives list"""
        try:
            headers = {"Authorization": f"Bearer {self.session_token}"}
            response = requests.get(f"{self.base_url}/api/narratives", headers=headers, timeout=10)
            success = response.status_code == 200
            data = response.json() if success else {}
            
            if success:
                count = len(data) if isinstance(data, list) else 0
                message = f"Found {count} narratives"
            else:
                message = f"Status {response.status_code}"
                
            self.log_result("Get Narratives", success, message, response.status_code)
            return success, data
        except Exception as e:
            self.log_result("Get Narratives", False, str(e))
            return False, {}

    def test_dashboard_overview(self):
        """Test dashboard overview endpoint"""
        try:
            headers = {"Authorization": f"Bearer {self.session_token}"}
            response = requests.get(f"{self.base_url}/api/dashboard/overview", headers=headers, timeout=10)
            success = response.status_code == 200
            data = response.json() if success else {}
            
            if success:
                datasets_count = data.get('total_datasets', 0)
                narratives_count = data.get('total_narratives', 0)
                message = f"Overview: {datasets_count} datasets, {narratives_count} narratives"
            else:
                message = f"Status {response.status_code}"
                
            self.log_result("Dashboard Overview", success, message, response.status_code)
            return success, data
        except Exception as e:
            self.log_result("Dashboard Overview", False, str(e))
            return False, {}

    def run_full_test_suite(self):
        """Run complete test suite"""
        print(f"🚀 Starting Founder Intelligence Platform API Tests")
        print(f"Backend URL: {self.base_url}")
        print(f"Session Token: {self.session_token}")
        print(f"Test Dataset: {self.dataset_id}")
        print("=" * 80)
        
        # Basic tests
        self.test_health()
        self.test_auth_me()
        
        # Data management tests
        self.test_get_datasets()
        uploaded_success, upload_data = self.test_upload_csv()
        
        # Metrics tests using existing dataset
        self.test_compute_metrics()
        self.test_get_metrics()
        
        # AI-powered tests (GPT-5.2)
        self.test_generate_insights()
        self.test_get_insights()
        self.test_generate_narrative()
        self.test_get_narratives()
        
        # Dashboard
        self.test_dashboard_overview()
        
        # Test with uploaded dataset if upload worked
        if uploaded_success and hasattr(self, 'uploaded_dataset_id'):
            print("\n🔄 Testing with newly uploaded dataset...")
            self.test_compute_metrics(self.uploaded_dataset_id)
            self.test_get_metrics(self.uploaded_dataset_id)
        
        # Results summary
        print("=" * 80)
        print(f"📊 TEST SUMMARY")
        print(f"Tests run: {self.tests_run}")
        print(f"Tests passed: {self.tests_passed}")
        print(f"Success rate: {(self.tests_passed/self.tests_run)*100:.1f}%")
        
        # Show failed tests
        failed_tests = [r for r in self.test_results if not r['success']]
        if failed_tests:
            print(f"\n❌ FAILED TESTS ({len(failed_tests)}):")
            for test in failed_tests:
                print(f"  • {test['test']}: {test['message']}")
        
        return self.tests_passed == self.tests_run

def main():
    tester = FounderIntelligenceAPITester()
    success = tester.run_full_test_suite()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())