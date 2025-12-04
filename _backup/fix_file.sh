cd ~/container_build/poc-portal/pb_public

# 1. Check main structure
echo "=== Main structure ==="
ls -la | grep -E "^d|index.html|style.css"

# 2. Check js/ directory
echo -e "\n=== js/ directory ==="
ls -la js/ | head -15

# 3. Check productboard subdirectory  
echo -e "\n=== js/productboard/ directory ==="
ls -la js/productboard/

# 4. Check css directory
echo -e "\n=== css/ directory ==="
ls -la css/

# 5. Check if productboard CSS exists
echo -e "\n=== css/productboard/ directory ==="
ls -la css/productboard/ 2>&1

# 6. Check index.html script tags
echo -e "\n=== index.html script tags ==="
grep "script" index.html | grep -v "^<!--"