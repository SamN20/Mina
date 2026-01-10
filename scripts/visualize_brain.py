import json
import os
import sys
import math
import random

# Configuration
MEMORY_FILE = os.path.join(os.getcwd(), 'data', 'memory.json')
OUTPUT_FILE = os.path.join(os.getcwd(), 'brain_map.html')

def load_memories():
    if not os.path.exists(MEMORY_FILE):
        print(f"Error: {MEMORY_FILE} not found.")
        sys.exit(1)
    
    with open(MEMORY_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    memories = []
    
    for user_id, profile in data.items():
        user_name = profile.get('displayName') or "Unknown"
        user_memories = profile.get('memories', [])
        
        for m in user_memories:
            if 'embedding' in m and m['embedding']:
                memories.append({
                    'text': m['text'],
                    'category': m.get('category', 'unknown'),
                    'user': user_name,
                    'embedding': m['embedding'],
                    'timestamp': m.get('timestamp', 0)
                })
    
    return memories

def simple_pca(data, num_components=2):
    """
    A simple implementation of PCA using standard math (no numpy required if not present).
    This is less efficient but works for small datasets (Mina's brain).
    """
    try:
        import numpy as np
        print("Using NumPy for PCA...")
        X = np.array([m['embedding'] for m in data])
        
        # Center the data
        X_mean = np.mean(X, axis=0)
        X_centered = X - X_mean
        
        # Covariance matrix
        cov_matrix = np.cov(X_centered, rowvar=False)
        
        # Eigenvalues and Eigenvectors
        eigen_values, eigen_vectors = np.linalg.eigh(cov_matrix)
        
        # Sort indices
        sorted_index = np.argsort(eigen_values)[::-1]
        sorted_eigenvectors = eigen_vectors[:, sorted_index]
        
        # Select components
        eigenvector_subset = sorted_eigenvectors[:, 0:num_components]
        
        # Transform
        X_reduced = np.dot(X_centered, eigenvector_subset)
        
        return X_reduced.tolist()
        
    except ImportError:
        print("NumPy not found. Falling back to simple random projection (Not optimal but visualizes something)...")
        # Fallback: Just pick 2 random dimensions that have high variance? 
        # Or just projection. 
        # Actually without numpy, doing PCA on 384 dimensions is painful in pure python.
        # Let's simple project roughly.
        projected = []
        # We will iterate and map to 2 dims using a fixed random projection matrix
        random.seed(42)
        dims = len(data[0]['embedding'])
        # Create 2 random vectors
        w1 = [random.uniform(-1, 1) for _ in range(dims)]
        w2 = [random.uniform(-1, 1) for _ in range(dims)]
        
        # Normalize
        mag1 = math.sqrt(sum(x*x for x in w1))
        mag2 = math.sqrt(sum(x*x for x in w2))
        w1 = [x/mag1 for x in w1]
        w2 = [x/mag2 for x in w2]
        
        for m in data:
            vec = m['embedding']
            x = sum(v*w for v, w in zip(vec, w1))
            y = sum(v*w for v, w in zip(vec, w2))
            projected.append([x, y])
            
        return projected

def generate_html(memories, coords):
    # Prepare data for Plotly
    points = []
    for i, m in enumerate(memories):
        points.append({
            'x': coords[i][0],
            'y': coords[i][1],
            'text': m['text'],
            'category': m['category'],
            'user': m['user']
        })
    
    # Generate HTML content
    # We embed the data directly into the Javascript
    html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <title>Mina's Brain Map</title>
    <script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
    <style>
        body {{ margin: 0; padding: 0; background: #111; color: #eee; font-family: sans-serif; }}
        #plot {{ width: 100vw; height: 100vh; }}
        .info {{ position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.8); padding: 10px; border-radius: 5px; pointer-events: none; }}
    </style>
</head>
<body>
    <div id="plot"></div>
    <div class="info">
        <h3>Mina's Memory Map</h3>
        <p>Total Memories: {len(memories)}</p>
        <p>Scroll to zoom, hover to read.</p>
    </div>

    <script>
        const rawData = {json.dumps(points)};
        
        // Group by category for coloring
        const categories = [...new Set(rawData.map(d => d.category))];
        const traces = [];
        
        categories.forEach(cat => {{
            const group = rawData.filter(d => d.category === cat);
            
            traces.push({{
                x: group.map(d => d.x),
                y: group.map(d => d.y),
                text: group.map(d => `<b>${{d.user}}</b><br>${{d.text}}`),
                mode: 'markers',
                type: 'scatter',
                name: cat,
                marker: {{ size: 12, opacity: 0.8 }}
            }});
        }});
        
        const layout = {{
            paper_bgcolor: '#111',
            plot_bgcolor: '#111',
            title: {{
                text: 'Semantic Memory Map',
                font: {{ color: '#fff' }}
            }},
            xaxis: {{ 
                showgrid: false, 
                zeroline: false, 
                showticklabels: false 
            }},
            yaxis: {{ 
                showgrid: false, 
                zeroline: false, 
                showticklabels: false 
            }},
            legend: {{
                font: {{ color: '#fff' }}
            }},
            hovermode: 'closest'
        }};
        
        Plotly.newPlot('plot', traces, layout);
    </script>
</body>
</html>
    """
    
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write(html_content)
    
    print(f"Generated {OUTPUT_FILE}")

def main():
    print("Loading memories...")
    memories = load_memories()
    
    if not memories:
        print("No memories found to visualize.")
        return

    print(f"Found {len(memories)} memories. Projecting...")
    coords = simple_pca(memories)
    
    generate_html(memories, coords)

if __name__ == "__main__":
    main()
